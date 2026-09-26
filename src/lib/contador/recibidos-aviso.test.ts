import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeLaCarga } from "./recibidos-aviso";

const base = { entraron: 0, notasDeCredito: 0, aRevisar: 0, yaCargados: 0, conErrores: 0 };

test("reimportar el mismo archivo dice que ya estaban cargados, no que fallaron", () => {
  assert.equal(avisoDeLaCarga({ ...base, yaCargados: 13 }), "No entró ningún comprobante nuevo. 13 ya estaban cargados (no se duplican).");
});

test("ya cargados y con errores se cuentan por separado", () => {
  assert.equal(
    avisoDeLaCarga({ ...base, yaCargados: 12, conErrores: 1 }),
    "No entró ningún comprobante nuevo. 12 ya estaban cargados (no se duplican). 1 con errores: no se cargó (el detalle está abajo).",
  );
});

test("plurales bien dichos: 1 nota de crédito, 1 comprobante, 1 ya estaba", () => {
  assert.equal(
    avisoDeLaCarga({ ...base, entraron: 1, notasDeCredito: 1, aRevisar: 1, yaCargados: 1 }),
    "Entró 1 comprobante (1 nota de crédito, que resta). 1 quedó a revisar. 1 ya estaba cargado (no se duplica).",
  );
  assert.equal(
    avisoDeLaCarga({ ...base, entraron: 12, notasDeCredito: 2, conErrores: 100 }),
    "Entraron 12 comprobantes (2 notas de crédito, que restan). 100 con errores: no se cargaron (el detalle está abajo).",
  );
  assert.doesNotMatch(avisoDeLaCarga({ ...base, entraron: 12, notasDeCredito: 1 }), /1 notas/);
});
