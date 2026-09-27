import { test } from "node:test";
import assert from "node:assert/strict";
import { leerContenido, precioPorUnidadDeMedida, textoDelContenido } from "./unidad-medida";

test("la presentación se lee en gramos, mililitros o unidades", () => {
  assert.deepEqual(leerContenido("900 ml"), { base: "l", cantidad: 900 });
  assert.deepEqual(leerContenido("1,5 L"), { base: "l", cantidad: 1500 });
  assert.deepEqual(leerContenido("2.25 lts"), { base: "l", cantidad: 2250 });
  assert.deepEqual(leerContenido("500 g"), { base: "kg", cantidad: 500 });
  assert.deepEqual(leerContenido("1 kg"), { base: "kg", cantidad: 1000 });
  assert.deepEqual(leerContenido("x 12 u"), { base: "u", cantidad: 12 });
  assert.deepEqual(leerContenido("354 cc"), { base: "l", cantidad: 354 });
  assert.deepEqual(leerContenido("500 gr."), { base: "kg", cantidad: 500 });
});

test("un pack multiplica el contenido de cada unidad", () => {
  assert.deepEqual(leerContenido("6 x 354 ml"), { base: "l", cantidad: 2124 });
  assert.deepEqual(leerContenido("pack 4x1 L"), { base: "l", cantidad: 4000 });
});

test("lo que no dice cuánto trae no se inventa", () => {
  assert.equal(leerContenido("unidades"), null);
  assert.equal(leerContenido(""), null);
  assert.equal(leerContenido(null), null);
  assert.equal(leerContenido("1,5 g"), null);
  assert.equal(leerContenido("0 ml"), null);
  assert.equal(leerContenido("2,5 u"), null);
  assert.equal(leerContenido("docena"), null);
});

test("precio por litro de un envase de 900 ml: precio × 1000 ÷ 900, al centavo", () => {
  const r = precioPorUnidadDeMedida({ saleUnit: "UNIT", price: 1299, pricePerKg: null, presentacion: "900 ml" });
  assert.deepEqual(r, { base: "l", importe: 1443.33, rotulo: "el litro" });
});

test("precio por kilo de un paquete de 500 g y precio por unidad de una docena", () => {
  assert.deepEqual(precioPorUnidadDeMedida({ saleUnit: "UNIT", price: 1850, pricePerKg: null, presentacion: "500 g" }), {
    base: "kg",
    importe: 3700,
    rotulo: "el kg",
  });
  assert.deepEqual(precioPorUnidadDeMedida({ saleUnit: "UNIT", price: 4200, pricePerKg: null, presentacion: "x 12 u" }), {
    base: "u",
    importe: 350,
    rotulo: "c/u",
  });
});

test("un producto por peso ya tiene su precio por kilo", () => {
  assert.deepEqual(precioPorUnidadDeMedida({ saleUnit: "WEIGHT", price: null, pricePerKg: 12990, presentacion: "kg" }), {
    base: "kg",
    importe: 12990,
    rotulo: "el kg",
  });
});

test("sin precio, sin presentación legible o de una sola unidad, no hay precio por unidad", () => {
  assert.equal(precioPorUnidadDeMedida({ saleUnit: "UNIT", price: null, pricePerKg: null, presentacion: "1 L" }), null);
  assert.equal(precioPorUnidadDeMedida({ saleUnit: "UNIT", price: 900, pricePerKg: null, presentacion: "unidades" }), null);
  assert.equal(precioPorUnidadDeMedida({ saleUnit: "UNIT", price: 900, pricePerKg: null, presentacion: "1 u" }), null);
  assert.equal(precioPorUnidadDeMedida({ saleUnit: "WEIGHT", price: null, pricePerKg: 0, presentacion: "kg" }), null);
});

test("el contenido en palabras para el cartel", () => {
  assert.equal(textoDelContenido({ base: "l", cantidad: 1500 }), "1,5 L");
  assert.equal(textoDelContenido({ base: "l", cantidad: 354 }), "354 ml");
  assert.equal(textoDelContenido({ base: "kg", cantidad: 1000 }), "1 kg");
  assert.equal(textoDelContenido({ base: "u", cantidad: 12 }), "12 u");
});
