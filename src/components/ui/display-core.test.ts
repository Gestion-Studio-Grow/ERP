import { test } from "node:test";
import assert from "node:assert/strict";
import { leerDelta, partirCifra, rutaMicroLinea } from "./display-core";

test("la plata se parte en $, entero con punto de miles y centavos con coma", () => {
  assert.deepEqual(partirCifra(26250.4), { signo: "", moneda: "$", entero: "26.250", decimales: ",40", unidad: "", texto: "$26.250,40" });
  assert.equal(partirCifra(20595658.99).texto, "$20.595.658,99");
  assert.equal(partirCifra(67656, "plata", true).texto, "$67.656");
  assert.equal(partirCifra(999.995).texto, "$1.000,00", "redondea medio para arriba");
  assert.equal(partirCifra(-3200).texto, "-$3.200,00");
  assert.equal(partirCifra(-0.001).texto, "$0,00", "nunca «-0»");
  assert.equal(partirCifra(Number.NaN).texto, "—");
});

test("el peso lleva 3 decimales (gramos) y «kg»; los números, sin decimales", () => {
  assert.equal(partirCifra(1.28, "kg").texto, "1,280 kg");
  assert.equal(partirCifra(0.96, "kg").decimales, ",960");
  assert.equal(partirCifra(1234, "numero").texto, "1.234");
});

test("el delta lleva signo y palabra; subir es bueno o malo según qué se mide", () => {
  const ventas = leerDelta(12.4, "%", "el martes pasado");
  assert.equal(ventas.cifra, "+12,4 %");
  assert.equal(ventas.lectura, "buena");
  assert.equal(ventas.enPalabras, "12,4 % más que el martes pasado");
  const gastos = leerDelta(12.4, "%", "ayer", false);
  assert.equal(gastos.lectura, "mala");
  const baja = leerDelta(-3200, "$", "ayer");
  assert.equal(baja.cifra, "−$3.200");
  assert.equal(baja.sentido, "baja");
  assert.equal(leerDelta(0, "%", "ayer").lectura, "neutra");
  assert.equal(leerDelta(0, "%", "ayer").cifra, "igual");
});

test("la micro línea: sin 2 datos reales no hay línea; una serie plana va al medio", () => {
  assert.equal(rutaMicroLinea([5]), null);
  assert.equal(rutaMicroLinea([1, Number.NaN, 3]), null);
  const r = rutaMicroLinea([10, 20, 30], 120, 32, 3)!;
  assert.equal(r.d, "M3 29 L60 16 L117 3");
  assert.deepEqual(r.ultimo, { x: 117, y: 3 });
  assert.equal(rutaMicroLinea([7, 7])!.d, "M3 16 L117 16");
});
