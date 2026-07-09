import { test } from "node:test";
import assert from "node:assert/strict";
import { toInventoryRow, buildInventory, type InventoryInput } from "./valuation";

const P = (over: Partial<InventoryInput>): InventoryInput => ({
  productId: "p", name: "Prod", unit: "u", stock: 10, unitCost: 100, lowStockAt: 5, ...over,
});

test("toInventoryRow: valuación = stock × costo, redondeada", () => {
  const r = toInventoryRow(P({ stock: 3, unitCost: 12000.5 }));
  assert.equal(r.valuation, 36001.5);
  assert.equal(r.unitCost, 12000.5);
  assert.equal(r.sinCosto, false);
});

test("toInventoryRow: sin costo (null o ≤0) → costo 0, valuación 0, sinCosto true", () => {
  assert.equal(toInventoryRow(P({ unitCost: null })).valuation, 0);
  assert.equal(toInventoryRow(P({ unitCost: null })).sinCosto, true);
  assert.equal(toInventoryRow(P({ unitCost: 0 })).sinCosto, true);
});

test("toInventoryRow: stock bajo cuando stock ≤ umbral", () => {
  assert.equal(toInventoryRow(P({ stock: 5, lowStockAt: 5 })).belowLowStock, true);
  assert.equal(toInventoryRow(P({ stock: 6, lowStockAt: 5 })).belowLowStock, false);
  assert.equal(toInventoryRow(P({ stock: 0, lowStockAt: 5 })).belowLowStock, true);
});

test("buildInventory: resumen (productos, valuación total, bajo stock, sin costo)", () => {
  const { rows, summary } = buildInventory([
    P({ productId: "a", stock: 2, unitCost: 1000, lowStockAt: 5 }), // valuación 2000, bajo stock
    P({ productId: "b", stock: 10, unitCost: 500, lowStockAt: 5 }), // valuación 5000
    P({ productId: "c", stock: 4, unitCost: null, lowStockAt: 5 }), // sin costo, bajo stock
  ]);
  assert.equal(rows.length, 3);
  assert.equal(summary.productos, 3);
  assert.equal(summary.valuacionTotal, 7000); // 2000 + 5000 + 0
  assert.equal(summary.bajoStock, 2); // a y c
  assert.equal(summary.sinCosto, 1); // c
});

test("buildInventory: vacío → resumen en cero", () => {
  const { rows, summary } = buildInventory([]);
  assert.equal(rows.length, 0);
  assert.deepEqual(summary, { productos: 0, valuacionTotal: 0, bajoStock: 0, sinCosto: 0 });
});
