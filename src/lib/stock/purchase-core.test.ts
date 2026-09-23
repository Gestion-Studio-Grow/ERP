// Tests de la aritmética de compras/reposición (lógica pura, sin DB ni tenant).
// Patrón node:test como cash-register.test.ts. `insertStockPurchase` (que toca
// Prisma) no se testea acá: se cubren los helpers puros que arman las líneas y el
// total, que es donde vive el riesgo de cálculo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { round2 } from "@/lib/round";
import {
  buildPurchaseLines,
  compraRepetida,
  costoDeLaLinea,
  huellaDeCompra,
  medioDeLaRecepcion,
  purchaseTotal,
  whereCompras,
  VENTANA_REPETIDA_MS,
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

// ── Compra repetida (doble envío) ───────────────────────────────────────────

const recepcion = {
  kind: "COMPRA",
  supplierId: "prov-x",
  supplier: "Frigorífico X",
  lineas: [
    { productId: "vacio", quantity: 20, unitCost: 0 },
    { productId: "lomo", quantity: 4.5, unitCost: 0 },
  ],
};

test("la misma compra enviada dos veces en dos minutos se reconoce (el orden de las líneas no importa)", () => {
  const ahora = new Date("2026-09-23T13:00:00Z");
  const huella = huellaDeCompra(recepcion);
  const otraVez = huellaDeCompra({ ...recepcion, lineas: [...recepcion.lineas].reverse() });
  assert.equal(otraVez, huella);
  const recientes = [{ code: 41, createdAt: new Date(ahora.getTime() - 30_000), huella }];
  assert.equal(compraRepetida(huella, recientes, ahora)?.code, 41);
  // Pasada la ventana ya no es un doble toque: es otra entrega.
  const vieja = [{ code: 41, createdAt: new Date(ahora.getTime() - VENTANA_REPETIDA_MS - 1), huella }];
  assert.equal(compraRepetida(huella, vieja, ahora), null);
});

test("otra cantidad, otro proveedor u otro tipo NO es la misma compra", () => {
  const h = huellaDeCompra(recepcion);
  assert.notEqual(huellaDeCompra({ ...recepcion, lineas: [{ productId: "vacio", quantity: 19.5, unitCost: 0 }, recepcion.lineas[1]] }), h);
  assert.notEqual(huellaDeCompra({ ...recepcion, supplierId: "prov-y" }), h);
  assert.notEqual(huellaDeCompra({ ...recepcion, kind: "REPOSICION" }), h);
  // Sin proveedor del maestro manda el texto, sin mayúsculas ni espacios de más.
  assert.equal(
    huellaDeCompra({ ...recepcion, supplierId: null, supplier: " frigorífico x " }),
    huellaDeCompra({ ...recepcion, supplierId: null, supplier: "Frigorífico X" }),
  );
});

// ── Quién recibe: sin costs:read, sin costo ni medio de pago ────────────────

test("la dueña (con costos): la compra lleva el medio elegido y el costo de cada línea", () => {
  assert.equal(medioDeLaRecepcion("COMPRA", true, "EFECTIVO"), "EFECTIVO");
  assert.equal(costoDeLaLinea(true, () => 6543), 6543);
  assert.equal(costoDeLaLinea(true, () => null), 0, "costo vacío: 0 (reposición sin costo), no un error");
});

test("el encargado (sin costs:read): el costo y el medio de pago se IGNORAN aunque lleguen", () => {
  assert.equal(medioDeLaRecepcion("COMPRA", false, "EFECTIVO"), null, "sin medio: la recepción no mueve la caja");
  assert.equal(costoDeLaLinea(false, () => 6543), 0);
  // Ni siquiera se lee: un costo ilegible no le rompe la recepción.
  const ilegible = () => {
    throw new Error("Línea 1, costo: no es un importe");
  };
  assert.equal(costoDeLaLinea(false, ilegible), 0);
  assert.throws(() => costoDeLaLinea(true, ilegible), /no es un importe/);
});

test("una reposición no lleva medio de pago, ni de la dueña", () => {
  assert.equal(medioDeLaRecepcion("REPOSICION", true, "MP"), null);
  assert.equal(medioDeLaRecepcion("COMPRA", true, null), null, "sin elegir: el backstop de insertStockPurchase decide");
});

test("el where de las compras es uno: las devolvibles sin fecha y las del mes para el Inicio", () => {
  assert.deepEqual(whereCompras("t"), { tenantId: "t", kind: "COMPRA" });
  const desde = new Date("2026-09-01T03:00:00.000Z");
  assert.deepEqual(whereCompras("t", desde), { tenantId: "t", kind: "COMPRA", createdAt: { gte: desde } });
});
