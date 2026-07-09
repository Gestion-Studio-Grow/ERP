import { test } from "node:test";
import assert from "node:assert/strict";
import { agingOf, summarizeAging } from "./aging";

const HOY = new Date("2026-07-08T12:00:00Z");

test("agingOf: sin vencimiento → neutral (fiado light)", () => {
  const a = agingOf(null, HOY);
  assert.equal(a.state, "sin-vencimiento");
  assert.equal(a.tone, "neutral");
  assert.equal(a.diasVencida, null);
});

test("agingOf: vencida → danger, con días de mora", () => {
  const a = agingOf(new Date("2026-07-03T00:00:00Z"), HOY);
  assert.equal(a.state, "vencida");
  assert.equal(a.tone, "danger");
  assert.equal(a.diasVencida, 5);
  assert.match(a.label, /Vencida \(5 días\)/);
});

test("agingOf: por vencer dentro del umbral → warning; 'vence hoy' en 0 días", () => {
  const enTres = agingOf(new Date("2026-07-11T00:00:00Z"), HOY);
  assert.equal(enTres.state, "por-vencer");
  assert.equal(enTres.tone, "warning");
  const hoy = agingOf(new Date("2026-07-08T00:00:00Z"), HOY);
  assert.equal(hoy.state, "por-vencer");
  assert.equal(hoy.label, "Vence hoy");
});

test("agingOf: más lejos que el umbral → al día, neutral", () => {
  const a = agingOf(new Date("2026-08-30T00:00:00Z"), HOY);
  assert.equal(a.state, "al-dia");
  assert.equal(a.tone, "neutral");
});

test("agingOf: umbral configurable (porVencerDias)", () => {
  const venc = new Date("2026-07-20T00:00:00Z"); // 12 días
  assert.equal(agingOf(venc, HOY).state, "al-dia"); // default 7
  assert.equal(agingOf(venc, HOY, { porVencerDias: 15 }).state, "por-vencer");
});

test("agingOf: singular 1 día (mora y por vencer)", () => {
  assert.match(agingOf(new Date("2026-07-07T00:00:00Z"), HOY).label, /Vencida \(1 día\)/);
  assert.match(agingOf(new Date("2026-07-09T00:00:00Z"), HOY).label, /Por vencer \(1 día\)/);
});

test("summarizeAging: reparte saldos por estado", () => {
  const items = [
    { saldo: 1000, vencimiento: new Date("2026-07-03T00:00:00Z") }, // vencida
    { saldo: 500, vencimiento: new Date("2026-07-10T00:00:00Z") }, // por vencer
    { saldo: 300, vencimiento: new Date("2026-09-01T00:00:00Z") }, // al día
    { saldo: 200, vencimiento: null }, // sin venc → al día (neutral)
  ];
  const s = summarizeAging(items, HOY);
  assert.equal(s.total, 2000);
  assert.equal(s.vencido, 1000);
  assert.equal(s.porVencer, 500);
  assert.equal(s.alDia, 500); // 300 + 200
  assert.equal(s.cuentas, 4);
});
