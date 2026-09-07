// Tests de la elegibilidad de auto-registro de VENTA en caja (lógica pura, sin DB
// ni tenant). Patrón node:test, igual que cash-register.test.ts.
//
// La persistencia (buscar sesión abierta, idempotencia por orderId, insertar) NO
// se testea acá: eso vive en `recordCashSaleMovementInTx` (cash-sale-atomic.test.ts).
// Acá se blinda la DECISIÓN pura de "¿esta venta debería entrar al libro, y en qué
// columna?".
//
// Cambio de comportamiento (libro de caja multi-medio): antes SOLO el efectivo era
// elegible, porque el ledger era el cajón de un turno. Ahora el ledger es la caja del
// NEGOCIO en tres medios: una venta por Mercado Pago o transferencia es plata que entró
// y tiene que estar en el libro (columna MP). El arqueo del cajón no se descuadra porque
// filtra por medio (`summarizeMovements`) — ver el último test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cashSaleEligibility } from "./cash-sale";
import { expectedCash } from "./cash-register";

test("venta cobrada en efectivo es elegible, devuelve el monto y va a la columna EFECTIVO", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: 4500 });
  assert.deepEqual(r, { eligible: true, amount: 4500, method: "EFECTIVO" });
});

test("venta no cobrada no es elegible", () => {
  const r = cashSaleEligibility({ paid: false, paymentMethod: "EFECTIVO", total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "not-paid" });
});

test("cobro con MercadoPago SÍ entra al libro, en la columna MP", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "MERCADOPAGO", total: 4500 });
  assert.deepEqual(r, { eligible: true, amount: 4500, method: "MP" });
});

test("cobro por transferencia entra al libro en la misma columna MP (como lo lleva el negocio)", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "TRANSFERENCIA", total: 4500 });
  assert.deepEqual(r, { eligible: true, amount: 4500, method: "MP" });
});

test("cobrado sin método (null) no se asienta: no hay columna donde ponerlo", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: null, total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "unsupported-method" });
});

test("un método que el libro no sabe traducir no se adivina", () => {
  const r = cashSaleEligibility({ paid: true, paymentMethod: "CRIPTO", total: 4500 });
  assert.deepEqual(r, { eligible: false, reason: "unsupported-method" });
});

test("total no positivo no genera movimiento (nada que imputar)", () => {
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: "EFECTIVO", total: 0 }), {
    eligible: false,
    reason: "invalid-amount",
  });
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: "MERCADOPAGO", total: -100 }), {
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

test("el orden de las guardas: primero 'cobrado', luego 'medio', luego 'monto'", () => {
  // No cobrado gana aunque el método/monto sean inválidos.
  assert.deepEqual(cashSaleEligibility({ paid: false, paymentMethod: null, total: -1 }), {
    eligible: false,
    reason: "not-paid",
  });
  // Medio desconocido gana sobre el monto inválido.
  assert.deepEqual(cashSaleEligibility({ paid: true, paymentMethod: null, total: -1 }), {
    eligible: false,
    reason: "unsupported-method",
  });
});

test("una VENTA por MP en el ledger NO mueve el efectivo esperado del arqueo (el cajón sigue idéntico)", () => {
  const soloEfectivo = [{ type: "VENTA" as const, amount: 4500, method: "EFECTIVO" as const }];
  const conMp = [...soloEfectivo, { type: "VENTA" as const, amount: 9900, method: "MP" as const }];
  assert.equal(expectedCash(10000, soloEfectivo), 14500);
  assert.equal(expectedCash(10000, conMp), 14500, "la venta por MP está en el libro pero no en el cajón");
});
