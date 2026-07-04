// QA de identidad fiscal (CUIT + condición IVA receptor). Corre con `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esCuitValido,
  formatearCuit,
  codigoCondicionIvaReceptor,
} from "../identidad-fiscal";

// ---------------------------------------------------------------- CUIT válido
test("CUIT válido (dígito verificador correcto)", () => {
  // CUIT real de ARCA/AFIP: 33-69345023-9.
  assert.equal(esCuitValido("33-69345023-9"), true);
  assert.equal(esCuitValido("33693450239"), true); // sin guiones
});

test("CUIT inválido: dígito verificador equivocado", () => {
  assert.equal(esCuitValido("33-69345023-1"), false);
});

test("CUIT inválido: longitud, vacío, todos iguales", () => {
  assert.equal(esCuitValido("123"), false);
  assert.equal(esCuitValido(""), false);
  assert.equal(esCuitValido(null), false);
  assert.equal(esCuitValido(undefined), false);
  assert.equal(esCuitValido("11111111111"), false);
});

test("formatearCuit agrupa XX-XXXXXXXX-X", () => {
  assert.equal(formatearCuit("33693450239"), "33-69345023-9");
  assert.equal(formatearCuit("123"), "123"); // no oculta un dato malo
});

// ------------------------------------------------- condición IVA receptor (RG 5616)
test("mapeo de condición IVA receptor a códigos de ARCA", () => {
  assert.equal(codigoCondicionIvaReceptor("RESPONSABLE_INSCRIPTO"), 1);
  assert.equal(codigoCondicionIvaReceptor("EXENTO"), 4);
  assert.equal(codigoCondicionIvaReceptor("CONSUMIDOR_FINAL"), 5);
  assert.equal(codigoCondicionIvaReceptor("MONOTRIBUTO"), 6);
  assert.equal(codigoCondicionIvaReceptor("NO_CATEGORIZADO"), 7);
});
