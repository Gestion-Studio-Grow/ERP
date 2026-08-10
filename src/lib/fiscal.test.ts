// Tests de las funciones PURAS de fiscal.ts (Core, ADR-006/026): cálculo de
// impuestos por condición del emisor y mapeo de la condición del receptor
// (RG 5616). `resolverPerfilFiscal` toca DB → no se prueba acá (cubierto por
// tsc + build); estas funciones no importan la conexión.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularImpuestos,
  condicionDesdeReceptorId,
  condicionReceptorId,
  getFiscalProfile,
} from "./fiscal";

test("calcularImpuestos RI: separa neto e IVA al 21% (IVA incluido)", () => {
  const r = calcularImpuestos("RESPONSABLE_INSCRIPTO", 121);
  assert.equal(r.neto, 100);
  assert.equal(r.total, 121);
  assert.deepEqual(r.iva, [{ alicuotaId: 5, base: 100, importe: 21 }]);
});

test("calcularImpuestos Monotributo/Exento: sin IVA (alícuota 0)", () => {
  for (const cond of ["MONOTRIBUTO", "EXENTO"] as const) {
    const r = calcularImpuestos(cond, 100);
    assert.equal(r.neto, 100);
    assert.equal(r.total, 100);
    assert.deepEqual(r.iva, [{ alicuotaId: 3, base: 100, importe: 0 }]);
  }
});

test("condicionReceptorId ↔ condicionDesdeReceptorId hacen round-trip", () => {
  for (const cond of [
    "RESPONSABLE_INSCRIPTO",
    "EXENTO",
    "CONSUMIDOR_FINAL",
    "MONOTRIBUTO",
  ] as const) {
    assert.equal(condicionDesdeReceptorId(condicionReceptorId(cond)), cond);
  }
});

test("condicionDesdeReceptorId con código desconocido cae a Consumidor Final", () => {
  assert.equal(condicionDesdeReceptorId(99), "CONSUMIDOR_FINAL");
  assert.equal(condicionDesdeReceptorId(null), "CONSUMIDOR_FINAL");
});

test("getFiscalProfile es el perfil provisional (Monotributo) por default", () => {
  const p = getFiscalProfile("t-1");
  assert.equal(p.condicionIva, "MONOTRIBUTO");
  assert.equal(p.provisional, true);
});
