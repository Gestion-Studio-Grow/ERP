import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProductMargins, margenDeLoVendido, productosBajoCosto, summarizeMargins, type MarginProductInput } from "./margin";

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

test("un Responsable Inscripto compara sin IVA: un precio que con IVA cubre el costo, sin IVA puede no cubrirlo", () => {
  const p = [{ id: "a", name: "Vacío", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 12100 }];
  const conIva = computeProductMargins(p, { a: 11000 });
  const sinIva = computeProductMargins(p, { a: 11000 }, { sinIva: true });
  assert.equal(conIva[0].price, 12100);
  assert.equal(productosBajoCosto(conIva), 0);
  assert.equal(sinIva[0].price, 10000, "12.100 / 1,21");
  assert.equal(sinIva[0].margin, -1000);
  assert.equal(productosBajoCosto(sinIva), 1);
});

test("lo vendido por producto: con el costo de cada venta; sin costo, sin margen inventado", () => {
  const filas = margenDeLoVendido(
    [
      { orderId: "p1", productId: "a", nombre: "Vacío", cantidad: 2, saleUnit: "WEIGHT", importe: 24200, costo: 12000, fuente: "guardado" },
      { orderId: "p2", productId: "a", nombre: "Vacío", cantidad: 1, saleUnit: "WEIGHT", importe: 12100, costo: 6500, fuente: "costo-de-hoy" },
      { orderId: "p2", productId: "b", nombre: "Chorizo", cantidad: 1, saleUnit: "WEIGHT", importe: 5000, costo: 0, fuente: "sin-costo" },
      { orderId: "p2", productId: null, nombre: "Envío", cantidad: 1, saleUnit: "UNIT", importe: 1000, costo: 0, fuente: "sin-producto" },
    ],
    { sinIva: true },
  );
  assert.deepEqual(
    filas.map((f) => [f.nombre, f.cantidad, f.ventas, f.costo, f.margen, f.conCostoDeHoy]),
    [
      ["Vacío", 3, 30000, 18500, 11500, true],
      ["Chorizo", 1, 4132.23, 0, null, false],
    ],
  );
});
