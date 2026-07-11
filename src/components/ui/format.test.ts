// ============================================================================
// TEST de format.ts — formateo de moneda/número para las pantallas de datos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtMoneyARS, fmtNumberAR, fmtCuit } from "./format";

test("fmtMoneyARS: decimals=0 para KPIs headline (tablas siguen en 2)", () => {
  assert.equal(fmtMoneyARS(1234567.89, 0), "$1.234.568");
  assert.equal(fmtMoneyARS(-1234.5, 0), "-$1.235");
});

test("fmtCuit: 11 dígitos -> XX-XXXXXXXX-X", () => {
  assert.equal(fmtCuit("20376833098"), "20-37683309-8");
});

test("fmtCuit: acepta guiones/espacios de entrada y normaliza", () => {
  assert.equal(fmtCuit("20-37683309-8"), "20-37683309-8");
  assert.equal(fmtCuit("20 37683309 8"), "20-37683309-8");
});

test("fmtCuit: largo distinto de 11 -> tal cual; vacío/null -> em dash", () => {
  assert.equal(fmtCuit("12345678"), "12345678");
  assert.equal(fmtCuit(null), "—");
  assert.equal(fmtCuit(undefined), "—");
  assert.equal(fmtCuit(""), "—");
});

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
