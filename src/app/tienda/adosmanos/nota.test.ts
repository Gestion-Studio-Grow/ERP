// La nota del pedido con los talles: nunca pasa el tope del alta ni pierde un talle en silencio (cert F8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { notaConTalles, TOPE_NOTA } from "./catalogo";

test("con muchos talles no pasa el tope y avisa cuántos quedaron afuera", () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ nombre: `Zapatilla modelo largo número ${i}`, cantidad: 1, talle: "42" }));
  const nota = notaConTalles(muchos, "Tocar timbre");
  assert.ok(nota.length <= TOPE_NOTA, String(nota.length));
  assert.match(nota, /\+\d+ más: confirmar por WhatsApp/);
});

test("con pocos talles, los talles primero y la nota libre después", () => {
  assert.equal(notaConTalles([{ nombre: "A", cantidad: 1, talle: "40" }], "hola"), "Talles: A, talle 40 (x1). hola");
  assert.equal(notaConTalles([], "hola"), "hola");
});
