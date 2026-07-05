// Tests de la aritmética pura de los ajustes de stock (F2): cómo cada motivo traduce
// el valor cargado por el operador en un delta FIRMADO, y las reglas de motivo/nota.
// `insertStockAdjustment` (que toca Prisma) no se testea acá — se cubre la lógica de
// signo, que es donde vive el riesgo (convertir una baja en suba, o un recuento mal).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentDelta,
  motivoMode,
  requiresNote,
  buildReason,
} from "./adjustment-core";

test("motivoMode: recuento cuenta, mermas restan, otro es delta firmado", () => {
  assert.equal(motivoMode("RECUENTO"), "COUNT");
  assert.equal(motivoMode("MERMA"), "LOSS");
  assert.equal(motivoMode("ROTURA"), "LOSS");
  assert.equal(motivoMode("VENCIMIENTO"), "LOSS");
  assert.equal(motivoMode("OTRO"), "SIGNED");
});

test("adjustmentDelta COUNT (recuento): delta = contado − stock actual", () => {
  assert.equal(adjustmentDelta("COUNT", 8, 10), -2); // faltan 2 respecto del sistema
  assert.equal(adjustmentDelta("COUNT", 12, 10), 2); // sobran 2
  assert.equal(adjustmentDelta("COUNT", 10, 10), 0); // coincide → no-op
});

test("adjustmentDelta LOSS (merma/rotura/vencimiento): siempre resta la magnitud", () => {
  assert.equal(adjustmentDelta("LOSS", 3, 10), -3);
  // Aunque el operador cargue negativo por error, una pérdida SIEMPRE baja.
  assert.equal(adjustmentDelta("LOSS", -3, 10), -3);
});

test("adjustmentDelta SIGNED (otro): respeta el signo del valor cargado", () => {
  assert.equal(adjustmentDelta("SIGNED", 5, 10), 5);
  assert.equal(adjustmentDelta("SIGNED", -5, 10), -5);
});

test("adjustmentDelta: redondea a 3 decimales (stock fraccional en kg)", () => {
  assert.equal(adjustmentDelta("COUNT", 9.25, 10), -0.75);
  assert.equal(adjustmentDelta("LOSS", 0.756, 10), -0.756);
});

test("adjustmentDelta: valor no numérico → 0 (línea inerte, no rompe el lote)", () => {
  assert.equal(adjustmentDelta("LOSS", NaN, 10), 0);
  assert.equal(adjustmentDelta("COUNT", NaN, 10), 0);
});

test("requiresNote: sólo OTRO exige nota (el resto la tiene en el motivo)", () => {
  assert.equal(requiresNote("OTRO"), true);
  assert.equal(requiresNote("MERMA"), false);
  assert.equal(requiresNote("RECUENTO"), false);
});

test("buildReason: motivo + nota; nunca vacío (reason obligatorio)", () => {
  assert.equal(buildReason("MERMA", "se cayó una caja"), "Merma — se cayó una caja");
  assert.equal(buildReason("RECUENTO", null), "Recuento");
  assert.equal(buildReason("RECUENTO", "   "), "Recuento"); // nota en blanco se ignora
});
