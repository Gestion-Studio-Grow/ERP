// La vista de Stock sale del MISMO cálculo que el read model: una sola definición de "stock
// bajo" y de "en negativo", y el costo vigente. Se ejecuta el cálculo real y se mapea.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStockValuation, sinCostos, type StockProductInput } from "@/lib/inventory/valuation";
import { aFilaDeInventario, aResumenDeInventario } from "./valuation";

const P = (over: Partial<StockProductInput>): StockProductInput => ({
  id: "p",
  name: "Prod",
  unit: "kg",
  stock: 10,
  lowStockAt: 5,
  trackStock: true,
  ...over,
});

test("la fila de la vista trae lo mismo que el read model: valuación, bajo el mínimo, negativo", () => {
  const v = computeStockValuation(
    [
      P({ id: "a", stock: 2, lowStockAt: 5 }), // bajo el mínimo, $2000
      P({ id: "b", stock: 10 }), // $5000
      P({ id: "c", stock: 4, lowStockAt: 5 }), // bajo el mínimo, sin costo
      P({ id: "d", stock: -0.14 }), // negativo: no se valúa, cuenta como bajo y como negativo
      P({ id: "e", stock: 1, lowStockAt: 5, trackStock: false }), // no controla stock: nunca "bajo"
    ],
    { a: 1000, b: 500, d: 800 },
  );
  const filas = new Map(v.rows.map((r) => [r.id, aFilaDeInventario(r)]));
  assert.deepEqual(filas.get("a"), {
    productId: "a",
    name: "Prod",
    unit: "kg",
    stock: 2,
    unitCost: 1000,
    valuation: 2000,
    belowLowStock: true,
    negative: false,
    sinCosto: false,
  });
  assert.equal(filas.get("c")!.sinCosto, true);
  assert.equal(filas.get("c")!.valuation, 0);
  assert.equal(filas.get("d")!.negative, true);
  assert.equal(filas.get("d")!.valuation, 0, "un negativo no resta valor");
  assert.equal(filas.get("e")!.belowLowStock, false);

  assert.deepEqual(aResumenDeInventario(v.summary), {
    productos: 5,
    valuacionTotal: 7000,
    bajoStock: 3, // a, c, d
    sinCosto: 2, // c y e tienen stock y no tienen costo (d no tiene stock para valuar)
    enNegativo: 1,
  });
});

test("sin costs:read la vista no lleva un peso, pero sí los avisos", () => {
  const v = sinCostos(computeStockValuation([P({ id: "a", stock: 2 })], { a: 1000 }));
  const f = aFilaDeInventario(v.rows[0]);
  assert.equal(f.unitCost, 0);
  assert.equal(f.valuation, 0);
  assert.equal(f.belowLowStock, true);
  assert.equal(aResumenDeInventario(v.summary).valuacionTotal, 0);
});
