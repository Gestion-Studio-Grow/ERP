// Tests del validador de CUIT/CUIL (dígito verificador módulo 11). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cuitValido, normalizarCuit } from "@/lib/cuit";

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

// UAT 16/10, punto 9: los prefijos 50, 51 y 55. Se aceptan con el mismo módulo 11; su clase de
// sujeto queda PROVISIONAL A CONFIRMAR (no se sostuvo con una fuente pública de ARCA).
test("prefijos 50, 51 y 55: válidos con el verificador correcto, inválidos con otro", async () => {
  const { claseDelPrefijo } = await import("@/lib/cuit");
  // 50-00000001-6: suma = 27, resto 5 → dv 6. 51-12345678-9 y 55-11111111-0, mismo cálculo.
  for (const bueno of ["50000000016", "51123456789", "55111111110", "50-12345678-2"]) {
    assert.equal(cuitValido(bueno), true, bueno);
    assert.equal(claseDelPrefijo(bueno), "a_confirmar", `${bueno}: la clase es provisional`);
  }
  for (const malo of ["50000000017", "51123456780", "55111111111"]) assert.equal(cuitValido(malo), false, malo);
});

test("la clase del prefijo: humana, jurídica, a confirmar o ninguna", async () => {
  const { claseDelPrefijo } = await import("@/lib/cuit");
  assert.equal(claseDelPrefijo("20111111112"), "humana");
  assert.equal(claseDelPrefijo("27-11111111-7"), "humana");
  assert.equal(claseDelPrefijo("30715554441"), "juridica");
  assert.equal(claseDelPrefijo("55000000018"), "a_confirmar");
  // Prefijos que siguen sin ser de un CUIT.
  for (const p of ["99", "52", "53", "54", "56", "40"]) assert.equal(claseDelPrefijo(`${p}000000000`), null, p);
});
