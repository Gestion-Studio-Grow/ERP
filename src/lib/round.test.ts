import { test } from "node:test";
import assert from "node:assert/strict";
import { round2 } from "./round";

// round2 es la regla ÚNICA del redondeo de dinero del POS (dedup de 4 copias idénticas).
// Comportamiento = Math.round(n * 100) / 100 (preservado, sin cambio de conducta).

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

test("round2: quirk binario conocido en x.xx5 (1.005 → 1.00) — unificar con EPSILON es decisión pendiente (R4)", () => {
  // 1.005 se representa como 1.00499999…; Math.round(100.4999…) = 100 → 1.00.
  // El camino fiscal usa la variante EPSILON-safe (→ 1.01); unificar cambia el redondeo
  // del POS al medio centavo y se eleva al PMO/ADR (docs/arquitectura M1/R4).
  assert.equal(round2(1.005), 1);
});
