import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAging, agingBucket, daysBetween } from "./aging";

// D2/D3 (ADR-060) — aging puro, sin DB. asOf fijo para determinismo.
const ASOF = new Date("2026-07-08T12:00:00Z");
const d = (s: string) => new Date(s + "T00:00:00Z");

test("saldo 0 → SETTLED (aunque esté vencida)", () => {
  const a = computeAging(0, d("2026-01-01"), ASOF);
  assert.equal(a.status, "SETTLED");
});

test("sin fecha de vencimiento → NO_DUE_DATE", () => {
  const a = computeAging(1000, null, ASOF);
  assert.equal(a.status, "NO_DUE_DATE");
  assert.equal(a.daysUntilDue, null);
});

test("vence en 20 días → NOT_DUE con daysUntilDue", () => {
  const a = computeAging(1000, d("2026-07-28"), ASOF);
  assert.equal(a.status, "NOT_DUE");
  assert.equal(a.daysUntilDue, 20);
});

test("vence en 5 días → DUE_SOON (dentro de la ventana default de 7)", () => {
  const a = computeAging(1000, d("2026-07-13"), ASOF);
  assert.equal(a.status, "DUE_SOON");
  assert.equal(a.daysUntilDue, 5);
});

test("vence hoy → DUE_SOON (0 días, todavía no vencida)", () => {
  const a = computeAging(1000, d("2026-07-08"), ASOF);
  assert.equal(a.status, "DUE_SOON");
  assert.equal(a.daysUntilDue, 0);
});

test("venció hace 3 días → OVERDUE con daysOverdue", () => {
  const a = computeAging(1000, d("2026-07-05"), ASOF);
  assert.equal(a.status, "OVERDUE");
  assert.equal(a.daysOverdue, 3);
  assert.equal(a.daysUntilDue, null);
});

test("ventana configurable: con dueSoonDays=30, vencer en 20 es DUE_SOON", () => {
  const a = computeAging(1000, d("2026-07-28"), ASOF, 30);
  assert.equal(a.status, "DUE_SOON");
});

test("daysBetween cuenta días de calendario", () => {
  assert.equal(daysBetween(d("2026-07-01"), d("2026-07-08")), 7);
  assert.equal(daysBetween(d("2026-07-08"), d("2026-07-01")), -7);
});

test("agingBucket: no vencida → CURRENT", () => {
  assert.equal(agingBucket(computeAging(1000, d("2026-08-01"), ASOF)), "CURRENT");
  assert.equal(agingBucket(computeAging(0, d("2026-01-01"), ASOF)), "CURRENT");
});

test("agingBucket: clasifica atraso en 1-30 / 31-60 / 61-90 / 90+", () => {
  assert.equal(agingBucket(computeAging(1, d("2026-06-28"), ASOF)), "D1_30"); // 10 días
  assert.equal(agingBucket(computeAging(1, d("2026-06-01"), ASOF)), "D31_60"); // 37 días
  assert.equal(agingBucket(computeAging(1, d("2026-05-01"), ASOF)), "D61_90"); // 68 días
  assert.equal(agingBucket(computeAging(1, d("2026-01-01"), ASOF)), "D90_PLUS"); // 188 días
});
