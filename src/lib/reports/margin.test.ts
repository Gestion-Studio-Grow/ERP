import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProductMargins, summarizeMargins, type MarginProductInput } from "./margin";

const PRODUCTS: MarginProductInput[] = [
  { id: "a", name: "Bife ancho", saleUnit: "WEIGHT", price: null, pricePerKg: 12000 },
  { id: "b", name: "Pala pro", saleUnit: "UNIT", price: 90000, pricePerKg: null },
  { id: "c", name: "Sin costo", saleUnit: "UNIT", price: 5000, pricePerKg: null },
  { id: "d", name: "Sin precio", saleUnit: "UNIT", price: null, pricePerKg: null },
  { id: "e", name: "A pérdida", saleUnit: "UNIT", price: 1000, pricePerKg: null },
];
const COSTS: Record<string, number> = { a: 8000, b: 60000, e: 1500 /* c y d sin costo */ };

test("computeProductMargins: solo productos con precio Y costo; usa pricePerKg si es por peso", () => {
  const rows = computeProductMargins(PRODUCTS, COSTS);
  const ids = rows.map((r) => r.id);
  assert.deepEqual(new Set(ids), new Set(["a", "b", "e"])); // c (sin costo), d (sin precio) fuera
  const a = rows.find((r) => r.id === "a")!;
  assert.equal(a.price, 12000); // usó pricePerKg
  assert.equal(a.unitLabel, "kg");
  assert.equal(a.cost, 8000);
  assert.equal(a.margin, 4000);
  assert.ok(Math.abs(a.marginPct - 4000 / 12000) < 1e-9);
});

test("computeProductMargins: ordena por margen % descendente", () => {
  const rows = computeProductMargins(PRODUCTS, COSTS);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].marginPct >= rows[i].marginPct, "debe ir de mayor a menor margen %");
  }
  // Pala: (90000-60000)/90000 = 33.3% ; Bife: 33.3% ; A pérdida: (1000-1500)/1000 = -50%.
  assert.equal(rows[rows.length - 1].id, "e"); // el negativo queda último
});

test("computeProductMargins: margen negativo (vende a pérdida) se incluye con signo", () => {
  const rows = computeProductMargins(PRODUCTS, COSTS);
  const e = rows.find((r) => r.id === "e")!;
  assert.equal(e.margin, -500);
  assert.ok(e.marginPct < 0);
});

test("computeProductMargins: no muta las entradas", () => {
  const snapshot = JSON.stringify(PRODUCTS);
  computeProductMargins(PRODUCTS, COSTS);
  assert.equal(JSON.stringify(PRODUCTS), snapshot);
});

test("summarizeMargins: cuenta, margen % promedio y cuántos venden a pérdida", () => {
  const rows = computeProductMargins(PRODUCTS, COSTS);
  const s = summarizeMargins(rows);
  assert.equal(s.count, 3);
  assert.equal(s.belowCostCount, 1); // solo "e"
  assert.ok(s.avgMarginPct > 0); // 33.3% + 33.3% + (-50%) promedio
});

test("summarizeMargins: sin filas → resumen en cero (sección no se renderiza)", () => {
  const s = summarizeMargins([]);
  assert.deepEqual(s, { count: 0, avgMarginPct: 0, belowCostCount: 0 });
});
