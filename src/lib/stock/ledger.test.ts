// Tests de la aritmética de signo del ledger de stock (lógica pura, sin DB ni tenant).
// Patrón node:test como cash-register.test.ts. `recordMovement` (que toca Prisma) no se
// testea acá: se cubren los helpers puros que deciden el signo y el redondeo, que es
// donde vive el riesgo de convertir una salida en entrada o de acumular error de float.

import { test } from "node:test";
import assert from "node:assert/strict";
import { movementDirection, signedDelta, round3 } from "./ledger";

test("round3: redondea a 3 decimales (stock fraccional en kg)", () => {
  assert.equal(round3(0.1 + 0.2), 0.3);
  assert.equal(round3(1 / 3), 0.333);
});

test("movementDirection: entradas +1, salidas -1, ajuste 0 (lo define el delta)", () => {
  assert.equal(movementDirection("COMPRA"), 1);
  assert.equal(movementDirection("REPOSICION"), 1);
  assert.equal(movementDirection("VENTA"), -1);
  assert.equal(movementDirection("CONSUMO"), -1);
  assert.equal(movementDirection("AJUSTE"), 0);
});

test("signedDelta: el TIPO fija el signo — un qty negativo en VENTA sigue restando", () => {
  // Magnitud, no signo del input: no se puede "sumar" stock con una VENTA.
  assert.equal(signedDelta("VENTA", 5), -5);
  assert.equal(signedDelta("VENTA", -5), -5);
  assert.equal(signedDelta("CONSUMO", 2), -2);
  assert.equal(signedDelta("COMPRA", 10), 10);
  assert.equal(signedDelta("COMPRA", -10), 10);
  assert.equal(signedDelta("REPOSICION", 3), 3);
});

test("signedDelta: AJUSTE respeta el delta firmado declarado (recuento arriba o abajo)", () => {
  assert.equal(signedDelta("AJUSTE", 4), 4); // recuento hacia arriba
  assert.equal(signedDelta("AJUSTE", -4), -4); // merma / recuento hacia abajo
});

test("signedDelta: redondea a 3 decimales (venta por peso)", () => {
  assert.equal(signedDelta("VENTA", 0.756), -0.756);
  assert.equal(signedDelta("COMPRA", 2.5), 2.5);
});
