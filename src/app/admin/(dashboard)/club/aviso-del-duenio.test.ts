// El aviso 🔔 del dueño, pintado con React (sin navegador): sólo a un dueño, sólo con pedidos esperando, y se apaga
// cuando se resuelven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as M from "@/lib/club/motor.mjs";
import { resolverCredito } from "@/lib/club/motor.mjs";
import { crearAlmacen, type RolDelPanel } from "./almacen";
import { AvisoDelDuenio, CintaDeCajaSinCerrar, textoAvisoDelDuenio, textoCajaSinCerrar } from "./aviso-del-duenio";

const HOY = "2026-10-17";
const almacen = (rol: RolDelPanel) => crearAlmacen({ hoy: HOY, clave: "gsg-club:prueba:yo:v1", almacenamiento: null, rol, enReposo: null });
const pintar = (a: ReturnType<typeof almacen>) => renderToStaticMarkup(h(AvisoDelDuenio, { almacen: a, rol: a.rol(), irASolapa: () => undefined }));

test("el texto: uno, varios, ninguno", () => {
  assert.equal(textoAvisoDelDuenio(0), null);
  assert.equal(textoAvisoDelDuenio(1), "Un pedido de crédito espera tu OK.");
  assert.equal(textoAvisoDelDuenio(3), "3 pedidos de crédito esperan tu OK.");
});

test("al dueño le aparece con el botón al Tablero; a recepción, no (la región queda montada vacía)", () => {
  const html = pintar(almacen("OWNER"));
  assert.match(html, /Un pedido de crédito espera tu OK\./);
  assert.match(html, /<button[^>]*>Ver y resolver en el Tablero<\/button>/);
  assert.match(html, /aria-live="polite"/);
  const recepcion = pintar(almacen("RECEPTION"));
  assert.match(recepcion, /<div aria-live="polite" data-ui="aviso-del-duenio"><\/div>/, "a recepción, la región del aviso del dueño montada y vacía");
  assert.doesNotMatch(recepcion, /espera tu OK/);
});

test("BP-053 · la caja que quedó sin cerrar: la cinta roja para todos (recepción y dueño), con «Cerrar esa caja» que lleva a la Caja", () => {
  assert.equal(textoCajaSinCerrar([]), null);
  assert.equal(textoCajaSinCerrar(["2026-10-20"]), "Quedó la caja del 20/10 sin cerrar.");
  assert.equal(textoCajaSinCerrar(["2026-10-18", "2026-10-20"]), "Quedaron 2 cajas sin cerrar (del 18/10 al 20/10).");
  for (const rol of ["RECEPTION", "OWNER"] as const) {
    const a = almacen(rol);
    // Una sola caja atrasada: la de ayer (las de antes, cerradas).
    const e = a.estado();
    e.caja.cierres = [];
    const ayer = M.sumarDias(HOY, -1);
    for (const dia of M.cajasSinCerrar(e, a.ahora()).filter((d) => d !== ayer)) e.caja.cierres.push({ dia, responsable: "Rober", fecha: dia, min: 0, esperado: 0, contado: 0, diferencia: 0, ingresos: 0, egresos: 0 });
    if (!M.cajasSinCerrar(e, a.ahora()).includes(ayer)) e.caja.movimientos.push({ id: "m-x", tipo: "ingreso", medio: "efectivo", monto: 1000, concepto: "x", reservaId: null, usuario: null, fecha: ayer, min: 20 * 60, caja: ayer });
    let fue: string | null = null;
    const html = renderToStaticMarkup(h(CintaDeCajaSinCerrar, { almacen: a, irASolapa: (id: string) => void (fue = id) }));
    assert.match(html, /role="alert"/, rol);
    assert.match(html, new RegExp(`Quedó la caja del ${Number(ayer.slice(8))}/${Number(ayer.slice(5, 7))} sin cerrar\\.`), rol);
    assert.match(html, />Cerrar esa caja<\/button>/, rol);
    void fue;
  }
  // Cerrada esa también, la cinta se va.
  const a = almacen("RECEPTION");
  for (const dia of M.cajasSinCerrar(a.estado(), a.ahora())) a.estado().caja.cierres.push({ dia, responsable: "Rober", fecha: dia, min: 0, esperado: 0, contado: 0, diferencia: 0, ingresos: 0, egresos: 0 });
  assert.equal(renderToStaticMarkup(h(CintaDeCajaSinCerrar, { almacen: a, irASolapa: () => undefined })), "");
});

test("resuelto el pedido, el aviso se apaga", () => {
  const a = almacen("OWNER");
  const n = a.estado().novedades.find((x) => x.estado === "pendiente")!;
  a.aplicar((e, ahora) => resolverCredito(e, n.id, { aprobar: false }, a.auth(), ahora));
  assert.doesNotMatch(pintar(a), /espera tu OK/);
});
