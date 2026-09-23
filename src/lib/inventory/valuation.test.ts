import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStockValuation, esStockBajo, estaEnNegativo, whereEnNegativo } from "./valuation";

// D5 (ADR-060) — valuación de inventario pura, sin DB.

const P = (id: string, stock: number, lowStockAt = 5, name = id, unit = "unidades", trackStock = true) => ({
  id,
  name,
  unit,
  stock,
  lowStockAt,
  trackStock,
});

test("valúa stock × costo y suma el total", () => {
  const v = computeStockValuation(
    [P("a", 10), P("b", 4)],
    { a: 100, b: 250 },
  );
  const a = v.rows.find((r) => r.id === "a")!;
  assert.equal(a.stockValue, 1000);
  assert.equal(a.valued, true);
  assert.equal(v.summary.totalValue, 1000 + 1000); // 10×100 + 4×250
  assert.equal(v.summary.productCount, 2);
  assert.equal(v.summary.unvaluedCount, 0);
});

test("producto sin costo se lista pero no valúa (unitCost null, stockValue 0)", () => {
  const v = computeStockValuation([P("a", 10)], {});
  assert.equal(v.rows[0].unitCost, null);
  assert.equal(v.rows[0].stockValue, 0);
  assert.equal(v.rows[0].valued, false);
  assert.equal(v.summary.totalValue, 0);
  assert.equal(v.summary.unvaluedCount, 1);
});

test("sin stock y sin costo no deja la valuación incompleta: no hay nada que valuar", () => {
  const v = computeStockValuation([P("a", 0), P("b", -1)], {});
  assert.equal(v.summary.unvaluedCount, 0);
});

test("costo 0, negativo o null se trata como sin costo", () => {
  const v = computeStockValuation([P("a", 10), P("b", 5), P("c", 5)], { a: 0, b: -3, c: null });
  assert.equal(v.rows.find((r) => r.id === "a")!.valued, false);
  assert.equal(v.rows.find((r) => r.id === "b")!.valued, false);
  assert.equal(v.rows.find((r) => r.id === "c")!.valued, false);
});

test("stock bajo: UNA definición — controla stock y stock ≤ mínimo (el borde cuenta)", () => {
  assert.equal(esStockBajo({ trackStock: true, stock: 3, lowStockAt: 5 }), true);
  assert.equal(esStockBajo({ trackStock: true, stock: 5, lowStockAt: 5 }), true);
  assert.equal(esStockBajo({ trackStock: true, stock: 8, lowStockAt: 5 }), false);
  // Un insumo que no controla existencias nunca está "bajo": su número no significa nada.
  assert.equal(esStockBajo({ trackStock: false, stock: 0, lowStockAt: 5 }), false);

  const v = computeStockValuation([P("a", 3, 5), P("b", 8, 5), P("c", 5, 5), P("d", 1, 5, "d", "u", false)], {
    a: 1,
    b: 1,
    c: 1,
    d: 1,
  });
  assert.equal(v.rows.find((r) => r.id === "a")!.lowStock, true);
  assert.equal(v.rows.find((r) => r.id === "b")!.lowStock, false);
  assert.equal(v.rows.find((r) => r.id === "c")!.lowStock, true);
  assert.equal(v.rows.find((r) => r.id === "d")!.lowStock, false);
  assert.equal(v.summary.lowStockCount, 2);
});

test("en negativo: controla stock y quedó bajo cero; el where de la base dice lo mismo", () => {
  assert.equal(estaEnNegativo({ trackStock: true, stock: -0.14 }), true);
  assert.equal(estaEnNegativo({ trackStock: true, stock: 0 }), false);
  assert.equal(estaEnNegativo({ trackStock: false, stock: -3 }), false);
  assert.deepEqual(whereEnNegativo("t1"), {
    tenantId: "t1",
    deletedAt: null,
    active: true,
    trackStock: true,
    stock: { lt: 0 },
  });
  const v = computeStockValuation([P("a", -2), P("b", -1, 5, "b", "u", false), P("c", 3)], { a: 100 });
  assert.equal(v.summary.negativeCount, 1);
  // Un negativo no resta valor: es un error de carga, no mercadería.
  assert.equal(v.rows.find((r) => r.id === "a")!.stockValue, 0);
});

test("ordena por valor de stock descendente (lo que más plata inmoviliza, primero)", () => {
  const v = computeStockValuation(
    [P("chico", 1), P("grande", 100), P("medio", 10)],
    { chico: 10, grande: 10, medio: 10 },
  );
  assert.deepEqual(v.rows.map((r) => r.id), ["grande", "medio", "chico"]);
});

test("cent-safe: stock fraccional (kg) × costo redondea a 2", () => {
  const v = computeStockValuation([P("carne", 3.333, 1, "Carne", "kg")], { carne: 9.99 });
  // 3.333 × 9.99 = 33.29667 → 33.30
  assert.equal(v.rows[0].stockValue, 33.3);
});

test("inventario vacío → summary en cero, sin romper", () => {
  const v = computeStockValuation([], {});
  assert.deepEqual(v.summary, { productCount: 0, totalValue: 0, lowStockCount: 0, unvaluedCount: 0, negativeCount: 0 });
});
