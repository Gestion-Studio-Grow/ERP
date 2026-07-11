// ============================================================================
// TEST de fmtDateTimeAr (gate UX/UI, fix 1) — fecha+hora corta en TZ Argentina.
// El bug que caza: el server corre en UTC (Netlify/Vercel) y un formatter que
// use la zona del server muestra la fecha corrida de día. Los asserts usan
// instantes UTC cuya fecha de pared en Buenos Aires (UTC-3) CAMBIA de día.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDateTimeAr } from "./datetime";

test("fmtDateTimeAr: 01:30 UTC es 22:30 del día ANTERIOR en Buenos Aires", () => {
  assert.equal(fmtDateTimeAr("2026-07-11T01:30:00.000Z"), "10/07/2026 22:30");
});

test("fmtDateTimeAr: mediodía UTC queda en el mismo día (09:00 AR)", () => {
  assert.equal(fmtDateTimeAr("2026-07-11T12:00:00.000Z"), "11/07/2026 09:00");
});

test("fmtDateTimeAr: medianoche de pared AR se muestra 00:xx, nunca 24:xx", () => {
  assert.equal(fmtDateTimeAr("2026-07-11T03:05:00.000Z"), "11/07/2026 00:05");
});

test("fmtDateTimeAr: acepta Date además de string ISO", () => {
  assert.equal(fmtDateTimeAr(new Date("2026-01-02T15:45:00.000Z")), "02/01/2026 12:45");
});

test("fmtDateTimeAr: entrada inválida vuelve tal cual, nunca NaN/NaN/NaN", () => {
  assert.equal(fmtDateTimeAr("no-es-fecha"), "no-es-fecha");
});
