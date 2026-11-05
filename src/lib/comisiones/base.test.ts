import { test } from "node:test";
import assert from "node:assert/strict";
import { montoVoucherDelCobro } from "./base";

test("contrato: cobro sin voucher → 0", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000 }), 0);
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, voucherCentavos: null }), 0);
});

test("contrato: 100 % voucher → el total", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, voucherCentavos: 1_500_000 }), 1_500_000);
});

test("contrato: voucher + efectivo → sólo la parte del voucher", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, voucherCentavos: 1_000_000 }), 1_000_000);
});

test("contrato: cobro anulado → 0", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, voucherCentavos: 1_500_000, anulado: true }), 0);
});

test("nunca más que el total ni negativo", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 500, voucherCentavos: 900 }), 500);
  assert.equal(montoVoucherDelCobro({ totalCentavos: 500, voucherCentavos: -3 }), 0);
  assert.equal(montoVoucherDelCobro({ totalCentavos: Number.NaN, voucherCentavos: 100 }), 0);
});
