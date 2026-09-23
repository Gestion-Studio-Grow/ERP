import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarOpciones } from "./buscador-filtro";

const OPS = [
  { id: "1", etiqueta: "Ojo de bife", detalle: "$21.000/kg" },
  { id: "2", etiqueta: "Lomo al vacío", detalle: "$25.900/kg" },
  { id: "3", etiqueta: "Vacío", detalle: "$15.000/kg" },
  { id: "4", etiqueta: "Bondiola", detalle: "$12.000/kg" },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("sin tildes ni mayúsculas", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "VACIO")), ["3", "2"]);
});

test("el que empieza con lo tipeado va primero", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "vac")), ["3", "2"]);
});

test("palabras en cualquier orden", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "vacio lomo")), ["2"]);
});

test("también busca en el detalle", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "12.000")), ["4"]);
});

test("vacío muestra las primeras, con tope", () => {
  assert.equal(filtrarOpciones(OPS, "", 2).length, 2);
  assert.deepEqual(filtrarOpciones(OPS, "zzz"), []);
});
