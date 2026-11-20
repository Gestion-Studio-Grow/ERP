// GSG-MIA-267 · tarea 7 (lógica pura, sin base): lo que las listas de Administración muestran cuando la plata se movió
// por otro camino que una cuota.
//  a. Cuentas a pagar: una orden de pago pagada salda comprobantes de proveedor, no cuotas; igual es un pago hecho, así
//     que aparece en «Pagados» y en «Todos» (y en ningún otro filtro). La búsqueda mira proveedor y número.
//  b. Bancos: la lista de abajo son los renglones del extracto importado. Si no hay ninguno pero las cuentas ya tienen
//     cobros y pagos, el texto no dice «sin movimientos»: dice que falta el extracto.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenesDelFiltro, textoSinRenglones } from "./empresa-core";

const op = (numero: number, estado: string, proveedor: string) => ({ id: `op${numero}`, numero, estado, supplier: { name: proveedor } });
const ORDENES = [op(1, "PAGADA", "Sonido Sur"), op(2, "PAGADA", "Catering Norte"), op(3, "PAGADA", "Sonido Sur"), op(4, "PENDIENTE", "Luces SA"), op(5, "ANULADA", "Luces SA")];

test("MIA-267 · Cuentas a pagar: las órdenes pagadas están en «Pagados» y «Todos», en ningún otro filtro", () => {
  assert.deepEqual(ordenesDelFiltro(ORDENES, "pagados").map((o) => o.numero), [1, 2, 3]);
  assert.deepEqual(ordenesDelFiltro(ORDENES, "todos").map((o) => o.numero), [1, 2, 3]);
  assert.deepEqual(ordenesDelFiltro(ORDENES, "pendientes"), []);
  assert.deepEqual(ordenesDelFiltro(ORDENES, "vencidos"), []);
  assert.deepEqual(ordenesDelFiltro(ORDENES, "todos", "sonido").map((o) => o.numero), [1, 3]);
  assert.deepEqual(ordenesDelFiltro(ORDENES, "pagados", "OP 00000002").map((o) => o.numero), [2]);
});

test("MIA-267 · Bancos: sin renglones de extracto, el texto no niega los cobros y pagos de las cuentas", () => {
  const conCobros = textoSinRenglones(true);
  assert.doesNotMatch(conCobros, /Sin movimientos/);
  assert.match(conCobros, /extracto/);
  assert.match(conCobros, /cobros y pagos/);
  assert.match(textoSinRenglones(false), /extracto/);
});
