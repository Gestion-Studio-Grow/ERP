// Qué ofrece la ficha para escribirle: se EJECUTA con teléfonos como los que se tipean de verdad.

import { test } from "node:test";
import assert from "node:assert/strict";
import { contactoDeLaFicha } from "./contacto-ficha";

test("un celular tipeado de cualquier forma da el botón al 549 + área + número", () => {
  for (const telefono of ["11 4000-7919", "+54 9 11 4000 7919", "011 15-4000-7919"]) {
    assert.deepEqual(contactoDeLaFicha({ telefono, noQuiere: false, puedeEditar: true }), {
      tipo: "whatsapp",
      href: "https://wa.me/5491140007919",
    });
  }
});

test("si pidió no recibir mensajes no hay botón, aunque el número sea bueno", () => {
  assert.deepEqual(contactoDeLaFicha({ telefono: "11 4000-7919", noQuiere: true, puedeEditar: true }), { tipo: "no-quiere" });
});

test("un número que no es celular lo dice, y a quien puede editar le dice dónde corregirlo", () => {
  const conEdicion = contactoDeLaFicha({ telefono: "4000-7919", noQuiere: false, puedeEditar: true });
  assert.equal(conEdicion.tipo, "sin-celular");
  assert.match(conEdicion.tipo === "sin-celular" ? conEdicion.texto : "", /Editar datos/);
  const sinEdicion = contactoDeLaFicha({ telefono: "", noQuiere: false, puedeEditar: false });
  assert.equal(sinEdicion.tipo, "sin-celular");
  assert.doesNotMatch(sinEdicion.tipo === "sin-celular" ? sinEdicion.texto : "", /Editar datos/);
});
