// D4 (UAT 16/10): un turno con saldo se factura cuando queda saldado, no antes ni nunca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { facturarAlCompletar, facturarAlSaldar } from "./momento-factura";

test("al completar: sin saldo se factura en el acto; con saldo, espera", () => {
  assert.equal(facturarAlCompletar(0), true);
  assert.equal(facturarAlCompletar(-0.001), true);
  assert.equal(facturarAlCompletar(15000), false);
});

test("al saldar: sólo un turno terminado, sin saldo y sin 'No facturar'", () => {
  const base = { status: "COMPLETED", saldo: 0, noFacturarAlCompletar: false };
  assert.equal(facturarAlSaldar(base), true);
  assert.equal(facturarAlSaldar({ ...base, saldo: 100 }), false, "un cobro parcial todavía no factura");
  assert.equal(facturarAlSaldar({ ...base, status: "CONFIRMED" }), false, "la seña de un turno por venir no factura: factura el completar");
  assert.equal(facturarAlSaldar({ ...base, noFacturarAlCompletar: true }), false, "'No facturar' vale también para el saldo");
});
