// «¿Salió mal? Anular la venta» en CH (UAT venta de productos, E1): CH no tiene Ventas del día. Por
// decisión del dueño el enlace lleva a Pedidos, a Cerrados, y la persona toca «Anular» en la fila: el
// formulario no se abre solo desde la URL (así la pantalla se congelaba al anular, 3 de cada 5 veces).
// Lo que le pasa a la plata y al stock al anular por esa fila: anular-en-cerrados-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rutaDeAnulacion, rutaParaAnularLaVenta } from "../ventas/filtros";
import { leerFiltrosDelTablero } from "../pedidos/pedidos-core";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("sin Ventas del día (CH) el enlace lleva a Pedidos, a Cerrados, y ubica la venta; con ella, como siempre", () => {
  const ch = new URL(rutaDeAnulacion("v/1", { sinVentasDelDia: true }), "http://x");
  assert.equal(ch.pathname, "/admin/pedidos");
  assert.equal(leerFiltrosDelTablero(ch.searchParams).estado, "cerrados", "el tablero abre en la pestaña Cerrados");
  assert.equal(ch.searchParams.get("venta"), "v/1", "cambia con cada venta: cierra el cajón aunque ya se estuviera en Cerrados");
  assert.equal(ch.hash, "#pedido-v%2F1", "en el diseño de siempre, la fila de esa venta");
  assert.equal(ch.searchParams.get("anular"), null, "no pide abrir el formulario");
  assert.equal(rutaDeAnulacion("v/1", { sinVentasDelDia: false }), rutaParaAnularLaVenta("v/1"));
});

test("el mostrador usa ese enlace, y sólo CH lo pide", () => {
  const nucleo = fuente("./nucleo-de-venta.tsx");
  assert.match(nucleo, /<Link href=\{rutaDeAnulacion\(ultima\.venta\.id, \{ sinVentasDelDia \}\)\}/);
  assert.doesNotMatch(nucleo, /rutaParaAnularLaVenta/);
  assert.match(fuente("./MostradorDeVenta.tsx"), /sinVentasDelDia=\{quienCompra === "clienta"\}/);
});

test("Pedidos no abre el formulario desde la URL: se anula por la fila, con un toque", () => {
  const tablero = fuente("../pedidos/TableroPedidos.tsx");
  const pagina = fuente("../pedidos/page.tsx");
  for (const [nombre, texto] of [["tablero", tablero], ["página", pagina]] as const) {
    assert.doesNotMatch(texto, /anular\??:|get\("anular"\)|destinoDeAnular|abiertoAlInicio/, nombre);
  }
  assert.match(tablero, /<Button size="sm" variant="ghost" onClick=\{\(\) => setAnularCerrado\(p\)\}>\s*Anular…/);
  assert.match(tablero, /\{anularCerrado && anulacion && \(/, "el diálogo sólo lo abre esa tecla");
  assert.match(pagina, /id=\{`pedido-\$\{o\.id\}`\}/, "la fila del diseño de siempre tiene el ancla del enlace");
});

test("en CH el diálogo de la fila dice «venta»", () => {
  const tablero = fuente("../pedidos/TableroPedidos.tsx");
  assert.match(tablero, /titulo=\{`Anular \$\{comercio \? "el pedido" : "la venta"\} #\$\{anularCerrado\.code\}`\}/);
  assert.match(tablero, /sustantivo=\{comercio \? "pedido" : "venta"\}/);
});

test("el cajón del mostrador se cierra para dejar ver Cerrados", () => {
  assert.match(fuente("../pedidos/MostradorEnCajon.tsx"), /if \(venta\) setAbierto\(false\)/);
});
