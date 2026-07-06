// Tests de la lógica pura del núcleo de Orden (ADR-026 · ADR-003).
// Foco: armado/snapshot de líneas, subtotal y la guarda anti-oversell del
// descuento de stock del POS (commit d48cc79). Sin DB ni red: solo las funciones
// puras que `insertOrder` usa por dentro. Corre con `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { round2 } from "@/lib/round";
import {
  sellPrice,
  buildOrderLines,
  orderSubtotal,
  stockDecrementLines,
  canDecrementStock,
  type OrderProduct,
} from "./order-core";

// Producto base reutilizable; cada test pisa lo que le importa.
function prod(over: Partial<OrderProduct> = {}): OrderProduct {
  return {
    id: "p1",
    name: "Bife",
    saleUnit: "UNIT",
    price: 1000,
    pricePerKg: null,
    trackStock: false,
    ...over,
  };
}

// --- round2 -----------------------------------------------------------------

test("round2 redondea a 2 decimales (half-up del binario de JS)", () => {
  assert.equal(round2(6675), 6675);
  assert.equal(round2(0.75 * 8900), 6675); // venta por kg
  assert.equal(round2(1.005), 1.0); // el binario de 1.005 cae por debajo → 1.00
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(0), 0);
});

// --- sellPrice --------------------------------------------------------------

test("sellPrice usa pricePerKg cuando la venta es por peso", () => {
  assert.equal(sellPrice({ saleUnit: "WEIGHT", price: 999, pricePerKg: 8900 }), 8900);
});

test("sellPrice usa price unitario cuando NO es por peso", () => {
  assert.equal(sellPrice({ saleUnit: "UNIT", price: 1500, pricePerKg: 8900 }), 1500);
});

test("sellPrice devuelve null si falta el precio correspondiente", () => {
  assert.equal(sellPrice({ saleUnit: "WEIGHT", price: 1500, pricePerKg: null }), null);
  assert.equal(sellPrice({ saleUnit: "UNIT", price: null, pricePerKg: 8900 }), null);
});

// --- buildOrderLines --------------------------------------------------------

test("buildOrderLines snapshotea nombre/precio del producto REAL, no del input", () => {
  const products = [prod({ id: "p1", name: "Bife de chorizo", price: 1200 })];
  const lines = buildOrderLines(products, [{ productId: "p1", qty: 3 }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, "Bife de chorizo");
  assert.equal(lines[0].unitPrice, 1200);
  assert.equal(lines[0].quantity, 3);
  assert.equal(lines[0].lineTotal, 3600);
});

test("buildOrderLines calcula el total de línea por kg y lo redondea", () => {
  const products = [prod({ saleUnit: "WEIGHT", price: null, pricePerKg: 8900 })];
  const lines = buildOrderLines(products, [{ productId: "p1", qty: 0.75 }]);
  assert.equal(lines[0].lineTotal, 6675); // 0.75 * 8900, round2
});

test("buildOrderLines descarta el ítem cuyo producto no está en el tenant", () => {
  // El producto pedido no vino de la query (otro tenant / borrado / inactivo).
  const lines = buildOrderLines([prod({ id: "p1" })], [{ productId: "ajeno", qty: 2 }]);
  assert.deepEqual(lines, []);
});

test("buildOrderLines descarta el producto sin precio de venta (null o <= 0)", () => {
  const sinPrecio = buildOrderLines([prod({ price: null })], [{ productId: "p1", qty: 1 }]);
  assert.deepEqual(sinPrecio, []);
  const cero = buildOrderLines([prod({ price: 0 })], [{ productId: "p1", qty: 1 }]);
  assert.deepEqual(cero, []);
  const negativo = buildOrderLines([prod({ price: -5 })], [{ productId: "p1", qty: 1 }]);
  assert.deepEqual(negativo, []);
});

test("buildOrderLines arma varias líneas y conserva el flag trackStock por producto", () => {
  const products = [
    prod({ id: "a", name: "A", price: 100, trackStock: true }),
    prod({ id: "b", name: "B", price: 250, trackStock: false }),
  ];
  const lines = buildOrderLines(products, [
    { productId: "a", qty: 2 },
    { productId: "b", qty: 1 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].trackStock, true);
  assert.equal(lines[1].trackStock, false);
});

// --- orderSubtotal ----------------------------------------------------------

test("orderSubtotal suma los totales de línea y redondea a 2 decimales", () => {
  const products = [
    prod({ id: "a", name: "A", saleUnit: "WEIGHT", price: null, pricePerKg: 8900 }),
    prod({ id: "b", name: "B", price: 1200 }),
  ];
  const lines = buildOrderLines(products, [
    { productId: "a", qty: 0.75 }, // 6675
    { productId: "b", qty: 2 }, // 2400
  ]);
  assert.equal(orderSubtotal(lines), 9075);
});

test("orderSubtotal de una orden vacía es 0", () => {
  assert.equal(orderSubtotal([]), 0);
});

// --- stockDecrementLines: qué líneas descuentan stock ----------------------

test("stockDecrementLines devuelve SOLO las líneas con trackStock", () => {
  const products = [
    prod({ id: "a", name: "A", price: 100, trackStock: true }),
    prod({ id: "b", name: "B", price: 100, trackStock: false }),
    prod({ id: "c", name: "C", price: 100, trackStock: true }),
  ];
  const lines = buildOrderLines(products, [
    { productId: "a", qty: 1 },
    { productId: "b", qty: 1 },
    { productId: "c", qty: 1 },
  ]);
  const toDecrement = stockDecrementLines(lines);
  assert.deepEqual(
    toDecrement.map((l) => l.productId),
    ["a", "c"],
  );
});

test("stockDecrementLines de una orden sin productos que trackean es vacía", () => {
  const products = [prod({ id: "a", price: 100, trackStock: false })];
  const lines = buildOrderLines(products, [{ productId: "a", qty: 5 }]);
  assert.deepEqual(stockDecrementLines(lines), []);
});

// --- canDecrementStock: la guarda anti-oversell ----------------------------

test("canDecrementStock permite vender cuando el stock alcanza justo o sobra", () => {
  assert.equal(canDecrementStock(10, 3), true); // sobra
  assert.equal(canDecrementStock(3, 3), true); // borde: justo (gte)
});

test("canDecrementStock RECHAZA vender más de lo que hay (anti-oversell)", () => {
  assert.equal(canDecrementStock(2, 3), false); // 1 de más
  assert.equal(canDecrementStock(0, 1), false); // sin stock
});

test("canDecrementStock nunca deja stock negativo ni permite cantidades no positivas", () => {
  assert.equal(canDecrementStock(5, 0), false);
  assert.equal(canDecrementStock(5, -1), false);
});

test("canDecrementStock soporta cantidades fraccionarias (venta por kg)", () => {
  assert.equal(canDecrementStock(1.0, 0.75), true);
  assert.equal(canDecrementStock(0.5, 0.75), false); // oversell fraccionario
  assert.equal(canDecrementStock(0.75, 0.75), true); // borde exacto
});
