// La ficha del proveedor: lo devuelto sale de un groupBy por costo (lo suma la base), no de la
// lista acotada. Se ejecuta la cuenta con grupos como los devuelve Prisma.

import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPRAS_EN_LA_FICHA, DEVOLUCIONES_EN_LA_FICHA, totalDevuelto } from "./supplier-repo";

test("lo devuelto: cantidad (firmada en el registro) × costo de cada grupo, de TODAS las devoluciones", () => {
  // 60 devoluciones: más de las 50 que lista la ficha. Antes el total salía de la lista.
  const grupos = [
    { unitCost: 7500, _sum: { qty: -12.5 }, _count: { _all: 40 } },
    { unitCost: 9000, _sum: { qty: -3 }, _count: { _all: 15 } },
    { unitCost: null, _sum: { qty: -2 }, _count: { _all: 5 } }, // sin costo: cuenta como devolución, no suma pesos
  ];
  assert.deepEqual(totalDevuelto(grupos), { pesos: 12.5 * 7500 + 3 * 9000, movimientos: 60 });
  assert.ok(60 > DEVOLUCIONES_EN_LA_FICHA);
  assert.deepEqual(totalDevuelto([]), { pesos: 0, movimientos: 0 });
});

test("las listas de la ficha siguen acotadas (y la pantalla dice 'las últimas N')", () => {
  assert.equal(COMPRAS_EN_LA_FICHA, 30);
  assert.equal(DEVOLUCIONES_EN_LA_FICHA, 50);
});
