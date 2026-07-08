import { test } from "node:test";
import assert from "node:assert/strict";
import { round2 } from "./round";

// round2 es la regla ÚNICA del redondeo de dinero de TODO el sistema (POS + fiscal).
// Comportamiento = EPSILON-safe Math.round((n + Number.EPSILON) * 100) / 100 (ADR-057, R4 cerrado).

test("round2 redondea a 2 decimales", () => {
  assert.equal(round2(1.234), 1.23);
  assert.equal(round2(1.236), 1.24);
  assert.equal(round2(10), 10);
  assert.equal(round2(0), 0);
});

test("round2 no arrastra error de coma flotante (0.1 + 0.2 → 0.3)", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test("round2 redondea negativos", () => {
  assert.equal(round2(-1.234), -1.23);
  assert.equal(round2(-1.236), -1.24);
});

test("round2 es idempotente sobre valores ya redondeados", () => {
  assert.equal(round2(round2(19.99)), 19.99);
});

test("round2: EPSILON-safe en la frontera x.xx5 (ADR-057, R4 cerrado)", () => {
  // Sin EPSILON, 1.005 se representa como 1.00499999… → Math.round(100.4999…) = 100 → 1.00.
  // Con la variante EPSILON-safe (unificada POS+fiscal por ADR-057) redondea comercial
  // "medio hacia arriba": 1.005 → 1.01, 1.015 → 1.02.
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(1.015), 1.02);
});
