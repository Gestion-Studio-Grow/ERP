// Tests de la aritmética de arqueo de caja (lógica pura, sin DB ni tenant).
// Patrón node:test como report-config.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movementSign,
  summarizeMovements,
  expectedCash,
  reconcileCash,
  round2,
  type CashMovementLike,
} from "./cash-register";

test("movementSign: ingresos suman, egresos/retiros restan, apertura es neutra", () => {
  assert.equal(movementSign("VENTA"), 1);
  assert.equal(movementSign("INGRESO"), 1);
  assert.equal(movementSign("EGRESO"), -1);
  assert.equal(movementSign("RETIRO"), -1);
  assert.equal(movementSign("APERTURA"), 0);
});

test("summarizeMovements agrupa por categoría e ignora la apertura", () => {
  const movs: CashMovementLike[] = [
    { type: "APERTURA", amount: 5000 }, // ignorado por el cálculo del esperado
    { type: "VENTA", amount: 1200 },
    { type: "VENTA", amount: 800 },
    { type: "INGRESO", amount: 300 },
    { type: "EGRESO", amount: 150 },
    { type: "RETIRO", amount: 2000 },
  ];
  const b = summarizeMovements(movs);
  assert.deepEqual(b, { sales: 2000, cashIn: 300, cashOut: 150, withdrawals: 2000 });
});

test("summarizeMovements descarta montos no positivos o no finitos", () => {
  const movs: CashMovementLike[] = [
    { type: "VENTA", amount: 100 },
    { type: "VENTA", amount: 0 },
    { type: "VENTA", amount: -50 },
    { type: "INGRESO", amount: Number.NaN },
    { type: "INGRESO", amount: Infinity },
  ];
  const b = summarizeMovements(movs);
  assert.deepEqual(b, { sales: 100, cashIn: 0, cashOut: 0, withdrawals: 0 });
});

test("expectedCash = inicial + ventas + ingresos − egresos − retiros", () => {
  const movs: CashMovementLike[] = [
    { type: "VENTA", amount: 10000 },
    { type: "INGRESO", amount: 500 },
    { type: "EGRESO", amount: 800 },
    { type: "RETIRO", amount: 3000 },
  ];
  // 5000 + 10000 + 500 - 800 - 3000 = 11700
  assert.equal(expectedCash(5000, movs), 11700);
});

test("expectedCash sin movimientos = solo el fondo inicial", () => {
  assert.equal(expectedCash(4500, []), 4500);
});

test("expectedCash trata un fondo inicial inválido como 0", () => {
  assert.equal(expectedCash(Number.NaN, [{ type: "VENTA", amount: 100 }]), 100);
  assert.equal(expectedCash(-1000, [{ type: "VENTA", amount: 100 }]), 100);
});

test("expectedCash no arrastra error de coma flotante", () => {
  // 0.1 + 0.2 = 0.30000000000000004 en float; el arqueo debe cuadrar en 0.30.
  const movs: CashMovementLike[] = [
    { type: "VENTA", amount: 0.1 },
    { type: "VENTA", amount: 0.2 },
  ];
  assert.equal(expectedCash(0, movs), 0.3);
});

test("reconcileCash: caja que cuadra da diferencia 0", () => {
  const movs: CashMovementLike[] = [{ type: "VENTA", amount: 5000 }];
  const r = reconcileCash(2000, movs, 7000);
  assert.equal(r.expected, 7000);
  assert.equal(r.counted, 7000);
  assert.equal(r.diff, 0);
});

test("reconcileCash: faltante da diferencia negativa", () => {
  const movs: CashMovementLike[] = [{ type: "VENTA", amount: 5000 }];
  // esperado 7000, contado 6800 → falta 200
  const r = reconcileCash(2000, movs, 6800);
  assert.equal(r.expected, 7000);
  assert.equal(r.diff, -200);
});

test("reconcileCash: sobrante da diferencia positiva", () => {
  const movs: CashMovementLike[] = [{ type: "VENTA", amount: 5000 }];
  // esperado 7000, contado 7300 → sobra 300
  const r = reconcileCash(2000, movs, 7300);
  assert.equal(r.expected, 7000);
  assert.equal(r.diff, 300);
});

test("reconcileCash devuelve el desglose del turno", () => {
  const movs: CashMovementLike[] = [
    { type: "VENTA", amount: 5000 },
    { type: "RETIRO", amount: 1000 },
  ];
  const r = reconcileCash(2000, movs, 6000);
  assert.deepEqual(r.breakdown, { sales: 5000, cashIn: 0, cashOut: 0, withdrawals: 1000 });
});

test("round2 redondea a dos decimales", () => {
  assert.equal(round2(1.234), 1.23);
  assert.equal(round2(1.236), 1.24);
  assert.equal(round2(2.5), 2.5);
  assert.equal(round2(7000), 7000);
});
