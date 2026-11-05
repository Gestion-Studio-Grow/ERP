import { test } from "node:test";
import assert from "node:assert/strict";
import { montoVoucherDelCobro } from "./base";

test("contrato: cobro sin voucher → 0", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, method: "EFECTIVO" }), 0);
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000 }), 0);
});

test("contrato: 100 % voucher → el total", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, method: "VOUCHER" }), 1_500_000);
});

test("contrato: voucher + efectivo → sólo la parte del voucher", () => {
  // Turno de $15.000: un cobro VOUCHER de $10.000 y otro EFECTIVO de $5.000, cobro a cobro.
  const cobros = [
    { totalCentavos: 1_000_000, method: "VOUCHER" },
    { totalCentavos: 500_000, method: "EFECTIVO" },
  ];
  assert.equal(cobros.reduce((s, c) => s + montoVoucherDelCobro(c), 0), 1_000_000);
  // Cobro combinado (hoy no existe): manda voucherCentavos.
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, voucherCentavos: 1_000_000 }), 1_000_000);
});

test("contrato: cobro anulado → 0", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 1_500_000, method: "VOUCHER", anulado: true }), 0);
});

test("nunca más que el total ni negativo", () => {
  assert.equal(montoVoucherDelCobro({ totalCentavos: 500, voucherCentavos: 900 }), 500);
  assert.equal(montoVoucherDelCobro({ totalCentavos: 500, voucherCentavos: -3, method: "VOUCHER" }), 0);
  assert.equal(montoVoucherDelCobro({ totalCentavos: Number.NaN, method: "VOUCHER" }), 0);
});
