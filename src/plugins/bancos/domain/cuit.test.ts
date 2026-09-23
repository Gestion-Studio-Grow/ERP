// Tests del validador de CUIT/CUIL (dígito verificador módulo 11). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cuitValido, normalizarCuit } from "./cuit";

test("CUITs válidos (verificador correcto)", () => {
  // 20-11111111-2: suma = 42, resto 9, dv = 2 (mismo fixture que arca-dispatch.test).
  assert.equal(cuitValido("20111111112"), true);
  assert.equal(cuitValido(20111111112), true);
  // 23-00000000-0: suma = 22, resto 0 → dv = 0.
  assert.equal(cuitValido("23000000000"), true);
  // 27-11111111-7: suma = 70, resto 4 → dv = 7.
  assert.equal(cuitValido("27111111117"), true);
});

test("tolera guiones, espacios y puntos (formatos de carga humana)", () => {
  assert.equal(cuitValido("20-11111111-2"), true);
  assert.equal(cuitValido("20 11111111 2"), true);
  assert.equal(normalizarCuit("20-11111111-2"), "20111111112");
});

test("verificador incorrecto → inválido", () => {
  assert.equal(cuitValido("20111111113"), false);
  assert.equal(cuitValido("20111111111"), false);
});

test("dv = 10 es inválido por definición (ARCA no lo emite)", () => {
  // Primeros 10 dígitos 2000000001 → suma = 12, resto 1 → dv "10": ningún
  // dígito final lo salva.
  for (let d = 0; d <= 9; d++) {
    assert.equal(cuitValido(`200000000${1}${d}`), false);
  }
});

test("forma inválida → inválido (largo, letras, prefijo desconocido)", () => {
  assert.equal(cuitValido(""), false);
  assert.equal(cuitValido("123"), false);
  assert.equal(cuitValido("2011111111X"), false);
  assert.equal(cuitValido("201111111120"), false); // 12 dígitos
  // 99 no es un prefijo de CUIT (99 es el DocTipo "consumidor final", otra cosa).
  assert.equal(cuitValido("99111111119"), false);
});
