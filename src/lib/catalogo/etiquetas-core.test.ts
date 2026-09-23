// ============================================================================
// Etiquetas de precio: el precio por kilo grande, 24 por hoja A4, una por página en rollo, y
// el nombre que tipeó una persona no se ejecuta.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANTILLAS,
  enHojas,
  esPlantilla,
  htmlDeEtiquetas,
  idsDesdeAfuera,
  precioDeEtiqueta,
  tamanioDeHojaPx,
  tamanioDelPrecio,
  unidadDeEtiqueta,
  type DatosEtiqueta,
} from "./etiquetas-core";

const et = (i: number, p: Partial<DatosEtiqueta> = {}): DatosEtiqueta => ({
  id: `p${i}`,
  nombre: `Corte vacuno ${i}`,
  saleUnit: "WEIGHT",
  precio: 13500,
  unidad: "kg",
  ...p,
});

test("el precio de la etiqueta: sin centavos si es redondo, con centavos si los tiene", () => {
  assert.equal(precioDeEtiqueta(13500), "$13.500");
  assert.equal(precioDeEtiqueta(1234.5), "$1.234,50");
  assert.equal(precioDeEtiqueta(950), "$950");
});

test("al lado del precio: 'el kg' en lo que se pesa; 'c/u' o la unidad en lo que se vende por unidad", () => {
  assert.equal(unidadDeEtiqueta({ saleUnit: "WEIGHT", unidad: "kg" }), "el kg");
  assert.equal(unidadDeEtiqueta({ saleUnit: "UNIT", unidad: "unidad" }), "c/u");
  assert.equal(unidadDeEtiqueta({ saleUnit: "UNIT", unidad: "" }), "c/u");
  assert.equal(unidadDeEtiqueta({ saleUnit: "UNIT", unidad: "docena" }), "x docena");
});

test("hojas: 60 etiquetas en A4 son 3 hojas (24 + 24 + 12); en rollo, 60 páginas", () => {
  const sesenta = Array.from({ length: 60 }, (_, i) => et(i));
  assert.deepEqual(enHojas(sesenta, "a4").map((h) => h.length), [24, 24, 12]);
  assert.equal(enHojas(sesenta, "rollo").length, 60);
  assert.equal(PLANTILLAS.a4.porHoja, 24);
  assert.deepEqual(enHojas([], "a4"), []);
});

test("A4: el documento es una hoja A4 de 3 × 8 por cada 24, con el precio por kilo grande y 'el kg' al lado", () => {
  const sesenta = Array.from({ length: 60 }, (_, i) => et(i));
  const html = htmlDeEtiquetas(sesenta, "a4", "MAGRA · precio al 23/09/2026");
  assert.match(html, /@page\{size:A4;margin:0\}/);
  assert.match(html, /grid-template-columns:repeat\(3,70mm\);grid-template-rows:repeat\(8,37mm\)/);
  assert.equal(html.match(/<section class="h">/g)?.length, 3);
  assert.equal(html.match(/<div class="e">/g)?.length, 60);
  // El precio por kilo, grande (30 pt, el nombre va a 11 pt), y "el kg" pegado.
  assert.ok(html.includes('<b style="font-size:30pt">$13.500</b><span class="u">el kg</span>'));
  assert.ok(html.includes("MAGRA · precio al 23/09/2026"));
  // En el papel no se imprime ningún borde: sólo se ve en pantalla.
  assert.match(html, /@media screen\{[^}]*\}[^@]*outline/);
  assert.doesNotMatch(html.replace(/@media screen\{.*\}\}/, ""), /border:[^0]/);
  assert.doesNotMatch(html, /<script/i);
});

test("rollo: una etiqueta por página de 60 × 40 mm", () => {
  const html = htmlDeEtiquetas([et(1), et(2, { saleUnit: "UNIT", precio: 950, unidad: "unidad" })], "rollo", "");
  assert.match(html, /@page\{size:60mm 40mm;margin:0\}/);
  assert.equal(html.match(/<section class="h">/g)?.length, 2);
  assert.ok(html.includes("$950</b><span class=\"u\">c/u</span>"));
});

test("el nombre que tipeó una persona no se ejecuta: va escapado", () => {
  const html = htmlDeEtiquetas([et(1, { nombre: '<img src=x onerror="alert(1)">Vacío & "premium"' })], "a4", "<b>MAGRA</b>");
  assert.doesNotMatch(html, /<img/);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Vacío &amp; &quot;premium&quot;"));
  assert.ok(html.includes("&lt;b&gt;MAGRA&lt;/b&gt;"));
});

test("un precio largo achica la letra para no salirse de la etiqueta", () => {
  assert.equal(tamanioDelPrecio("$13.500", "a4"), 30);
  assert.equal(tamanioDelPrecio("$123.456", "a4"), 24);
  assert.equal(tamanioDelPrecio("$1.234.567", "a4"), 20);
});

test("tamaño de la hoja en píxeles (vista previa): A4 a 96 ppp", () => {
  assert.deepEqual(tamanioDeHojaPx("a4"), { ancho: 794, alto: 1123 });
  assert.deepEqual(tamanioDeHojaPx("rollo"), { ancho: 227, alto: 151 });
});

test("lo que llega a la acción se valida: ids de texto, sin repetidos, con tope; plantilla conocida", () => {
  assert.deepEqual(idsDesdeAfuera(["a", "b", "a"]), ["a", "b"]);
  assert.equal(idsDesdeAfuera([]), null);
  assert.equal(idsDesdeAfuera("a"), null);
  assert.equal(idsDesdeAfuera([1]), null);
  assert.equal(idsDesdeAfuera(["x".repeat(65)]), null);
  assert.equal(idsDesdeAfuera(Array.from({ length: 2001 }, (_, i) => `p${i}`)), null);
  assert.equal(esPlantilla("a4"), true);
  assert.equal(esPlantilla("rollo"), true);
  assert.equal(esPlantilla("carta"), false);
});
