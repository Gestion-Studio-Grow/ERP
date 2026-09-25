import { test } from "node:test";
import assert from "node:assert/strict";
import { round2 } from "./round";

// round2 delega en la regla única de la plata (src/lib/dinero/redondeo.ts, ENG-109).
// Medio centavo hacia arriba, lejos del cero; un number vale lo que dicen sus 15 cifras.

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

test("round2: medio centavo hacia arriba en la frontera x,xx5 (1,005 → 1,01)", () => {
  // 1,005 se guarda en binario como 1,00499999…; por sus 15 cifras vale 1,005 y sube.
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(1.015), 1.02);
});

test("round2 sube los medios centavos que la regla anterior bajaba (ENG-109)", () => {
  // Con el épsilon de antes: 2,135 → 2,13; 4,015 → 4,01; −2,135 → −2,13.
  assert.equal(round2(2.135), 2.14);
  assert.equal(round2(4.015), 4.02);
  assert.equal(round2(-2.135), -2.14);
});
