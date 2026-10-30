// La nota del pedido con los aromas: nunca pasa el tope del alta ni pierde un aroma en silencio (cert F8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { notaConAromas } from "./catalogo";

test("con muchos aromas no pasa el tope y avisa cuántos quedaron afuera", () => {
  const r = Array.from({ length: 30 }, (_, i) => ({ nombre: `Vela de envase grande ${i}`, cantidad: 2, aroma: "Vainilla & Caramelo" }));
  const nota = notaConAromas(r, "regalo");
  assert.ok(nota.length <= 500, String(nota.length));
  assert.match(nota, /\+\d+ más: confirmar por WhatsApp/);
});

test("con un aroma, la nota es el renglón tal cual", () => {
  assert.equal(notaConAromas([{ nombre: "V", cantidad: 1, aroma: "Rosas" }], ""), "Aromas: V ×1 — Rosas");
});
