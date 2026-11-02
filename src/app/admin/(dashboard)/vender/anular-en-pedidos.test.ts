// «¿Salió mal? Anular la venta» en CH (UAT venta de productos, E1): terminaba en «Ventas del día no
// está disponible», para recepción y dueña. CH no tiene esa app: la venta se anula en Pedidos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rutaDeAnulacion, rutaParaAnularLaVenta } from "../ventas/filtros";
import { destinoDeAnular } from "../pedidos/pedidos-core";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("sin Ventas del día (CH) el enlace lleva a Pedidos; con ella, como siempre", () => {
  const ch = rutaDeAnulacion("v/1", { sinVentasDelDia: true });
  assert.equal(new URL(ch, "http://x").pathname, "/admin/pedidos");
  assert.equal(new URL(ch, "http://x").searchParams.get("anular"), "v/1");
  assert.doesNotMatch(ch, /\/admin\/ventas/);
  assert.equal(rutaDeAnulacion("v/1", { sinVentasDelDia: false }), rutaParaAnularLaVenta("v/1"));
});

test("el mostrador usa ese enlace, y sólo CH lo pide", () => {
  const nucleo = fuente("./nucleo-de-venta.tsx");
  assert.match(nucleo, /<Link href=\{rutaDeAnulacion\(ultima\.venta\.id, \{ sinVentasDelDia \}\)\}/);
  assert.doesNotMatch(nucleo, /rutaParaAnularLaVenta/);
  assert.match(fuente("./MostradorDeVenta.tsx"), /sinVentasDelDia=\{quienCompra === "clienta"\}/);
});

test("Pedidos resuelve ?anular=: cerrada al diálogo, en curso al cajón; sin permiso, nada", () => {
  const abiertos = [{ id: "a" }];
  const cerrados = [
    { id: "c", anulable: true },
    { id: "d", anulable: false },
  ];
  assert.deepEqual(destinoDeAnular("c", abiertos, cerrados), { tipo: "dialogo", pedido: cerrados[0] });
  assert.deepEqual(destinoDeAnular("a", abiertos, cerrados), { tipo: "cajon", pedido: abiertos[0] });
  assert.equal(destinoDeAnular("d", abiertos, cerrados), null, "no anulable para este rol o este día");
  assert.equal(destinoDeAnular("otra", abiertos, cerrados), null);
  assert.equal(destinoDeAnular(null, abiertos, cerrados), null);
});

test("el cajón del mostrador se cierra para dejar ver el formulario de anular", () => {
  assert.match(fuente("../pedidos/MostradorEnCajon.tsx"), /if \(anular\) setAbierto\(false\)/);
});
