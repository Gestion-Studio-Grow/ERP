// Tests de los nombres para mostrar (jurisdicciones y clases de comprobante). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaClase, nombreJurisdiccion } from "./textos";

test("nombreJurisdiccion: código corto → nombre de la provincia", () => {
  assert.equal(nombreJurisdiccion("NQ"), "Neuquén");
  assert.equal(nombreJurisdiccion("CABA"), "Ciudad de Buenos Aires");
  assert.equal(nombreJurisdiccion("SE"), "Santiago del Estero");
  assert.equal(nombreJurisdiccion("TF"), "Tierra del Fuego");
});

test("etiquetaClase: clase del producto → texto", () => {
  assert.equal(etiquetaClase("factura_a"), "Factura A");
  assert.equal(etiquetaClase("tique_peaje"), "Tique de peaje");
  assert.equal(etiquetaClase("tique_consumidor_final"), "Tique");
  assert.equal(etiquetaClase("sin_comprobante"), "Sin comprobante");
});
