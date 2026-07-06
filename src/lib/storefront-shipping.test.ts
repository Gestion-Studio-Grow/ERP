// Tests de la lógica pura de envío de la vidriera (storefront-shipping.ts).
// Sin DB ni red: sólo las funciones puras. Corre con `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shippingCost,
  amountToFreeShipping,
  qualifiesForFreeShipping,
  orderTotal,
  type ShippingConfig,
} from "./storefront-shipping";

// Config de referencia (la real de Shine Velas: fijo $3.500, gratis desde $25.000).
const cfg: ShippingConfig = { flatRate: 3500, freeThreshold: 25000 };

// --- shippingCost -----------------------------------------------------------

test("shippingCost: retiro en el local nunca cobra envío", () => {
  assert.equal(shippingCost(10000, "PICKUP", cfg), 0);
  assert.equal(shippingCost(0, "PICKUP", cfg), 0);
});

test("shippingCost: sin config de envío → 0 (vidriera histórica)", () => {
  assert.equal(shippingCost(10000, "DELIVERY", null), 0);
  assert.equal(shippingCost(10000, "DELIVERY", undefined), 0);
});

test("shippingCost: carrito vacío no cobra envío", () => {
  assert.equal(shippingCost(0, "DELIVERY", cfg), 0);
  assert.equal(shippingCost(-50, "DELIVERY", cfg), 0);
});

test("shippingCost: envío por debajo del umbral cobra el fijo", () => {
  assert.equal(shippingCost(8500, "DELIVERY", cfg), 3500);
  assert.equal(shippingCost(24999, "DELIVERY", cfg), 3500);
});

test("shippingCost: envío en o por encima del umbral es gratis", () => {
  assert.equal(shippingCost(25000, "DELIVERY", cfg), 0);
  assert.equal(shippingCost(40000, "DELIVERY", cfg), 0);
});

// --- amountToFreeShipping ---------------------------------------------------

test("amountToFreeShipping: devuelve el faltante exacto para el nudge", () => {
  assert.equal(amountToFreeShipping(8500, cfg), 16500);
  assert.equal(amountToFreeShipping(24999, cfg), 1);
});

test("amountToFreeShipping: 0 cuando ya califica, sin config, o carrito vacío", () => {
  assert.equal(amountToFreeShipping(25000, cfg), 0);
  assert.equal(amountToFreeShipping(30000, cfg), 0);
  assert.equal(amountToFreeShipping(8500, null), 0);
  assert.equal(amountToFreeShipping(0, cfg), 0);
});

// --- qualifiesForFreeShipping ----------------------------------------------

test("qualifiesForFreeShipping: refleja el umbral", () => {
  assert.equal(qualifiesForFreeShipping(24999, cfg), false);
  assert.equal(qualifiesForFreeShipping(25000, cfg), true);
  assert.equal(qualifiesForFreeShipping(0, cfg), false);
  assert.equal(qualifiesForFreeShipping(30000, null), false);
});

// --- orderTotal -------------------------------------------------------------

test("orderTotal: suma envío al subtotal según el modo", () => {
  assert.equal(orderTotal(8500, "DELIVERY", cfg), 12000); // 8500 + 3500
  assert.equal(orderTotal(8500, "PICKUP", cfg), 8500); // retiro sin envío
  assert.equal(orderTotal(25000, "DELIVERY", cfg), 25000); // envío gratis
  assert.equal(orderTotal(8500, "DELIVERY", null), 8500); // sin config
});
