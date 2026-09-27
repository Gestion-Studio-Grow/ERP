import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conVerificador,
  digitoVerificador,
  esEan13Valido,
  esGtinValido,
  limpiarCodigoLeido,
  variantesDeBusqueda,
} from "./ean";

// Códigos publicados por GS1 como ejemplo del cálculo (no son productos de nadie).
test("el dígito verificador de un EAN-13 sale de pesar 1 y 3 desde la derecha", () => {
  // 400638133393 → 1 (ejemplo clásico de GS1).
  assert.equal(digitoVerificador("400638133393"), 1);
  assert.equal(conVerificador("400638133393"), "4006381333931");
  // Un cuerpo que da suma múltiplo de 10 tiene verificador 0, no 10.
  assert.equal(digitoVerificador("000000000000"), 0);
});

test("EAN-8, UPC-A y GTIN-14 usan la misma cuenta, cambia sólo el largo", () => {
  assert.equal(digitoVerificador("9638507"), 4); // EAN-8 96385074
  assert.ok(esGtinValido("96385074"));
  assert.ok(esGtinValido("036000291452")); // UPC-A
  assert.ok(esGtinValido("10012345000017")); // GTIN-14 de ejemplo
});

test("un EAN-13 con un dígito cambiado se rechaza", () => {
  assert.ok(esEan13Valido("4006381333931"));
  assert.equal(esEan13Valido("4006381333932"), false);
  assert.equal(esEan13Valido("4006381333913"), false); // dos dígitos permutados
  assert.equal(esEan13Valido("400638133393"), false); // le falta uno
  assert.equal(esEan13Valido("40063813339a1"), false);
});

test("un largo que no es GTIN no pasa aunque la cuenta cierre", () => {
  assert.equal(esGtinValido("12"), false);
  assert.equal(esGtinValido(conVerificador("1234")), false);
});

test("un cuerpo con letras es un error de quien llama, no un código inválido", () => {
  assert.throws(() => digitoVerificador("12a4"), RangeError);
});

test("lo que manda el lector se limpia de espacios, tabs y saltos", () => {
  assert.equal(limpiarCodigoLeido(" 7790895000997\r\n"), "7790895000997");
  assert.equal(limpiarCodigoLeido("779-0895-000997"), "7790895000997");
  assert.equal(limpiarCodigoLeido(null), "");
});

test("un UPC-A se busca también como EAN-13 con un cero adelante, y al revés", () => {
  assert.deepEqual(variantesDeBusqueda("036000291452").sort(), ["0036000291452", "036000291452"].sort());
  assert.ok(variantesDeBusqueda("0036000291452").includes("036000291452"));
});

test("un código interno corto vale con o sin ceros a la izquierda; un EAN no se toca", () => {
  assert.deepEqual(variantesDeBusqueda("00123").sort(), ["00123", "123"].sort());
  assert.deepEqual(variantesDeBusqueda("7790895000997"), ["7790895000997"]);
  assert.deepEqual(variantesDeBusqueda("  "), []);
});
