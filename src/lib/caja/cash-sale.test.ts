// Tests de la elegibilidad de auto-registro de VENTA en caja (lógica pura, sin DB
// ni tenant). Patrón node:test, igual que cash-register.test.ts.
//
// La persistencia (buscar sesión abierta, idempotencia por orderId, insertar) NO
// se testea acá: eso vive en `recordCashSaleMovement` y depende de la DB. Acá se
// blinda la DECISIÓN pura de "¿esta venta debería mover la caja?".

import { test } from "node:test";
import assert from "node:assert/strict";
import { cashSaleEligibility } from "./cash-sale";

test("venta cobrada en efectivo es elegible y devuelve el monto", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: 4500 });
  assert.deepEqual(r, { eligible: true, amount: 4500 });
});

test("venta no cobrada no es elegible", () => {
  const r = cashSaleEligibility({ paid: false, paymentMethod: "EFECTIVO", total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "not-paid" });
});

test("cobro con MercadoPago no mueve la caja física", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "MERCADOPAGO", total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "not-cash" });
});

test("cobro por transferencia no mueve la caja física", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "TRANSFERENCIA", total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "not-cash" });
});

test("cobrado sin método (null) no cuenta como efectivo", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: null, total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "not-cash" });
});

test("total no positivo no genera movimiento (nada que imputar)", () => {
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: 0 }), {
    eligible: false,
    reason: "invalid-amount",
  });
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: -100 }), {
    eligible: false,
    reason: "invalid-amount",
  });
});

test("total no finito no genera movimiento", () => {
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: Number.NaN }), {
    eligible: false,
    reason: "invalid-amount",
  });
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: Infinity }), {
    eligible: false,
    reason: "invalid-amount",
  });
});

test("el orden de las guardas: primero 'cobrado', luego 'efectivo', luego 'monto'", () => {
  // No cobrado gana aunque el método/monto sean inválidos.
  assert.equal(
    cashSaleEligibility({ paid: false, paymentMethod: "MERCADOPAGO", total: -1 }).eligible,
    false,
  );
  assert.deepEqual(cashSaleEligibility({ paid: false, paymentMethod: "MERCADOPAGO", total: -1 }), {
    eligible: false,
    reason: "not-paid",
  });
});
