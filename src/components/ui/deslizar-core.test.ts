import { test } from "node:test";
import assert from "node:assert/strict";
import { alSoltar, avanceConTecla, avanceDe, UMBRAL_CONFIRMA } from "./deslizar-core";

test("el avance sigue al dedo y no se sale de la pista", () => {
  assert.equal(avanceDe(150, 300), 0.5);
  assert.equal(avanceDe(-20, 300), 0);
  assert.equal(avanceDe(400, 300), 1);
  assert.equal(avanceDe(10, 0), 0, "sin pista medida, no avanza");
});

test("soltar antes del final vuelve; al final confirma", () => {
  assert.equal(alSoltar(0.5), "vuelve");
  assert.equal(alSoltar(UMBRAL_CONFIRMA - 0.01), "vuelve");
  assert.equal(alSoltar(UMBRAL_CONFIRMA), "confirma");
  assert.equal(alSoltar(1), "confirma");
});

test("con el teclado: flechas de a 10 %, Inicio y Fin; otras teclas no la mueven", () => {
  assert.equal(avanceConTecla(0, "ArrowRight"), 0.1);
  assert.equal(avanceConTecla(0.95, "ArrowRight"), 1);
  assert.equal(avanceConTecla(0.1, "ArrowLeft"), 0);
  assert.equal(avanceConTecla(0.4, "End"), 1);
  assert.equal(avanceConTecla(0.4, "Home"), 0);
  assert.equal(avanceConTecla(0.4, "Enter"), null, "Enter no confirma: hay que llevarla hasta el final");
});
