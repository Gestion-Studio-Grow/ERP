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

// ── EQUIVALENCIA con el formateo de antes (PERFORMANCE-TERMINALES.md, ronda 2) ─────────────────
// `fmtMoneyARS` y `fmtNumberAR` reusan un `Intl.NumberFormat` por cantidad de decimales en vez de
// `toLocaleString` por llamada. Lo usa todo el sistema (CH en producción incluida): un solo
// carácter distinto es una regresión. Se compara contra la implementación de antes, tal cual era.
function moneyDeAntes(value: number | string | null | undefined, decimals = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${sign}$${abs}`;
}
function numberDeAntes(value: number | string | null | undefined, decimals = 0): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
const BORDES: (number | string | null | undefined)[] = [
  0, -0, 0.005, 0.004, 0.0049999, -0.005, -0.004, 0.5, 1.005, 2.675, 1234.5, 9900.5, 1234.567, -1234.5,
  999.995, 999999.995, 1e15, -1e15, 1e21, 1e-7, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
  Number.MAX_VALUE, NaN, Infinity, -Infinity, null, undefined,
  "1234.5", "-0", "0", "", " ", "abc", "1e3", "12,50", "0x10", "  42  ", "-9900.505",
];

test("fmtMoneyARS: mismo texto que con toLocaleString — 28.752 importes de −5.000 a 200.000 y los bordes, con 0 a 3 decimales", () => {
  let comparados = 0;
  for (const decimales of [0, 1, 2, 3]) {
    for (let i = -5000; i < 200000; i += 7.13) {
      assert.equal(fmtMoneyARS(i, decimales), moneyDeAntes(i, decimales), `${i} con ${decimales}`);
      comparados++;
    }
    for (const v of BORDES) assert.equal(fmtMoneyARS(v, decimales), moneyDeAntes(v, decimales), `${String(v)} con ${decimales}`);
  }
  for (const v of BORDES) assert.equal(fmtMoneyARS(v), moneyDeAntes(v), `${String(v)} por defecto`);
  assert.equal(comparados, 4 * 28752);
});

test("fmtNumberAR: mismo texto que con toLocaleString, positivos, negativos y los bordes", () => {
  for (const decimales of [0, 2, 3]) {
    for (let i = -5000; i < 200000; i += 7.13) assert.equal(fmtNumberAR(i, decimales), numberDeAntes(i, decimales), `${i} con ${decimales}`);
    for (const v of BORDES) assert.equal(fmtNumberAR(v, decimales), numberDeAntes(v, decimales), `${String(v)} con ${decimales}`);
  }
  for (const v of BORDES) assert.equal(fmtNumberAR(v), numberDeAntes(v), `${String(v)} por defecto`);
});

test("fmtMoneyARS: un `decimals` inválido tira el mismo RangeError que toLocaleString", () => {
  assert.throws(() => moneyDeAntes(1, 101), RangeError);
  assert.throws(() => fmtMoneyARS(1, 101), RangeError);
  assert.throws(() => fmtMoneyARS(1, -1), RangeError);
});
