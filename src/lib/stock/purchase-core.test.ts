// Tests de la aritmética de compras/reposición (lógica pura, sin DB ni tenant).
// Patrón node:test como cash-register.test.ts. `insertStockPurchase` (que toca
// Prisma) no se testea acá: se cubren los helpers puros que arman las líneas y el
// total, que es donde vive el riesgo de cálculo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  round2,
  buildPurchaseLines,
  purchaseTotal,
  type PurchaseProduct,
} from "./purchase-core";

const PRODUCTS: PurchaseProduct[] = [
  { id: "p1", name: "Cera depilatoria", unit: "unidades" },
  { id: "p2", name: "Bife de chorizo", unit: "kg" },
];

test("round2: redondea a 2 decimales", () => {
  assert.equal(round2(0.75 * 1234), 925.5);
  assert.equal(round2(1 / 3), 0.33);
});

test("buildPurchaseLines: snapshotea nombre/unidad y calcula el total de línea", () => {
  const lines = buildPurchaseLines(PRODUCTS, [
    { productId: "p1", qty: 10, unitCost: 500 },
    { productId: "p2", qty: 2.5, unitCost: 8900 },
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    productId: "p1",
    name: "Cera depilatoria",
    unit: "unidades",
    quantity: 10,
    unitCost: 500,
    lineTotal: 5000,
  });
  assert.equal(lines[1].lineTotal, round2(2.5 * 8900)); // 22250
});

test("buildPurchaseLines: descarta productos desconocidos y cantidades no válidas", () => {
  const lines = buildPurchaseLines(PRODUCTS, [
    { productId: "fantasma", qty: 5, unitCost: 100 }, // no existe → fuera
    { productId: "p1", qty: 0, unitCost: 100 }, // qty 0 → fuera
    { productId: "p1", qty: -3, unitCost: 100 }, // qty negativa → fuera
    { productId: "p2", qty: 1, unitCost: 100 }, // válida
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].productId, "p2");
});

test("buildPurchaseLines: costo ausente/negativo/basura → 0 (reposición sin costo)", () => {
  const lines = buildPurchaseLines(PRODUCTS, [
    { productId: "p1", qty: 4, unitCost: 0 },
    { productId: "p2", qty: 4, unitCost: -50 },
    { productId: "p1", qty: 4, unitCost: NaN },
  ]);
  assert.equal(lines.length, 3);
  for (const l of lines) {
    assert.equal(l.unitCost, 0);
    assert.equal(l.lineTotal, 0);
  }
});

test("purchaseTotal: suma las líneas redondeando (sin arrastrar coma flotante)", () => {
  const lines = buildPurchaseLines(PRODUCTS, [
    { productId: "p1", qty: 3, unitCost: 0.1 },
    { productId: "p2", qty: 3, unitCost: 0.2 },
  ]);
  // 0.3 + 0.6 = 0.9, sin el 0.8999999999999999 de sumar floats
  assert.equal(purchaseTotal(lines), 0.9);
});

test("purchaseTotal: entrada sin líneas → 0", () => {
  assert.equal(purchaseTotal([]), 0);
});
