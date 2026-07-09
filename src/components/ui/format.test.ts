// ============================================================================
// TEST de format.ts — formateo de moneda/número para las pantallas de datos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtMoneyARS, fmtNumberAR } from "./format";

test("fmtMoneyARS: entero positivo fuerza 2 decimales", () => {
  assert.equal(fmtMoneyARS(9900), "$9.900,00");
});

test("fmtMoneyARS: redondea/completa a 2 decimales (grado contable)", () => {
  assert.equal(fmtMoneyARS(9900.5), "$9.900,50");
  assert.equal(fmtMoneyARS(1234.567), "$1.234,57");
});

test("fmtMoneyARS: negativo -> signo ANTES del $ (saldo deudor)", () => {
  assert.equal(fmtMoneyARS(-1234.5), "-$1.234,50");
});

test("fmtMoneyARS: cero no lleva signo", () => {
  assert.equal(fmtMoneyARS(0), "$0,00");
  assert.equal(fmtMoneyARS(-0), "$0,00");
});

test("fmtMoneyARS: acepta string numérica (Decimal.toString() del server)", () => {
  assert.equal(fmtMoneyARS("1234.5"), "$1.234,50");
  assert.equal(fmtMoneyARS("-1234.5"), "-$1.234,50");
});

test("fmtMoneyARS: null/undefined/no-numérico -> em dash, nunca NaN ni $undefined", () => {
  assert.equal(fmtMoneyARS(null), "—");
  assert.equal(fmtMoneyARS(undefined), "—");
  assert.equal(fmtMoneyARS("no-es-un-numero"), "—");
  assert.equal(fmtMoneyARS(NaN), "—");
});

test("fmtNumberAR: sin decimals por default, agrupa miles es-AR", () => {
  assert.equal(fmtNumberAR(12345), "12.345");
});

test("fmtNumberAR: decimals fuerza la cantidad de decimales pedida", () => {
  assert.equal(fmtNumberAR(0.75, 3), "0,750");
});

test("fmtNumberAR: null/undefined/no-numérico -> em dash", () => {
  assert.equal(fmtNumberAR(null), "—");
  assert.equal(fmtNumberAR(undefined), "—");
  assert.equal(fmtNumberAR("x"), "—");
});
