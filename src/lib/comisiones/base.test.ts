import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDeComision, montoVoucherDelCobro, voucherNetoDelTurno } from "./base";

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

test("base de comisión: cobro de 10.000 con 4.000 de voucher → base 6.000 (regla del dueño)", () => {
  const filas = [
    { amount: 4000, method: "VOUCHER" },
    { amount: 6000, method: "EFECTIVO" },
  ];
  assert.equal(voucherNetoDelTurno(filas), 400_000);
  assert.equal(baseDeComision(10000, filas), 6000);
});

test("base de comisión: sin voucher es lo cobrado; todo voucher da 0; nunca negativa", () => {
  assert.equal(baseDeComision(10000, [{ amount: 10000, method: "TRANSFERENCIA" }]), 10000);
  assert.equal(baseDeComision(14000, [{ amount: 14000, method: "VOUCHER" }]), 0);
  assert.equal(baseDeComision(1000, [{ amount: 4000, method: "VOUCHER" }]), 0);
  assert.equal(baseDeComision(10000, []), 10000);
});

test("base de comisión: un voucher anulado (contrapartida negativa) ya no descuenta", () => {
  const filas = [
    { amount: 4000, method: "VOUCHER" },
    { amount: -4000, method: "VOUCHER" },
    { amount: 10000, method: "EFECTIVO" },
  ];
  assert.equal(voucherNetoDelTurno(filas), 0);
  assert.equal(baseDeComision(10000, filas), 10000);
});

test("base de comisión: centavos exactos, sin floats sueltos", () => {
  assert.equal(baseDeComision(100.3, [{ amount: 0.1, method: "VOUCHER" }, { amount: 100.2, method: "EFECTIVO" }]), 100.2);
});
