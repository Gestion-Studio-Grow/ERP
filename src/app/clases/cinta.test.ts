// Lo puro del turnero (T3C): con qué día/hora arranca, el botón fijo, el precio a la vista y sacar
// la hora que se ocupó recién.

import { test } from "node:test";
import assert from "node:assert/strict";
import { alternativasEnCinta, cercanas, diaYHora, horaCorta, inicioDeLaCinta, leerRecuerdo, precioElegido, sinLaHora, textoCta, textoPrecio } from "./cinta";
import { telefonoAlumno } from "@/lib/padel/core";

const iso = (d: string, hh: number) => new Date(`${d}T${String(hh + 3).padStart(2, "0")}:00:00.000Z`).toISOString(); // hora AR → UTC
const DIAS = [
  { fecha: "2026-10-23", etiqueta: "Hoy", horas: [iso("2026-10-23", 17), iso("2026-10-23", 18), iso("2026-10-23", 19)] },
  { fecha: "2026-10-24", etiqueta: "Mañana", horas: [iso("2026-10-24", 10)] },
  { fecha: "2026-10-27", etiqueta: "mar 27", horas: [iso("2026-10-27", 19)] },
];

test("horas en la del negocio", () => {
  assert.equal(horaCorta(iso("2026-10-23", 18)), "18:00");
  assert.equal(diaYHora(iso("2026-10-24", 10)), "sáb 24/10 10:00");
});

test("M-096: con amigos se ve c/u y el total antes de elegir la hora", () => {
  assert.equal(textoPrecio("GRUPAL", 3, 25000, 12000), "$ 12.000 c/u · total $ 36.000");
  assert.equal(textoPrecio("INDIVIDUAL", 1, 25000, 12000), "$ 25.000");
  assert.equal(textoPrecio("INDIVIDUAL", 1, 0, 0), null);
  assert.equal(precioElegido("GRUPAL", 9, 25000, 12000), 48000); // tope 4
});

test("el botón fijo dice qué se pide o qué falta", () => {
  assert.equal(textoCta({ etiquetaDia: null, hora: null, precio: 25000 }), "Elegí día y hora");
  assert.equal(textoCta({ etiquetaDia: "mar 27", hora: iso("2026-10-27", 19), precio: 25000 }), "Pedir mar 27 · 19:00 · $ 25.000");
  assert.equal(textoCta({ etiquetaDia: "Hoy", hora: iso("2026-10-23", 18), precio: 0 }), "Pedir hoy · 18:00");
});

test("M-100 / M-043: ?fecha abre ese día; ?hora libre abre día y hora; lo que no está, el primer día", () => {
  assert.deepEqual(inicioDeLaCinta(DIAS, { fecha: "2026-10-27" }), { fecha: "2026-10-27", hora: null });
  assert.deepEqual(inicioDeLaCinta(DIAS, { hora: iso("2026-10-24", 10) }), { fecha: "2026-10-24", hora: iso("2026-10-24", 10) });
  assert.deepEqual(inicioDeLaCinta(DIAS, { hora: iso("2026-10-24", 11) }), { fecha: "2026-10-23", hora: null });
  assert.deepEqual(inicioDeLaCinta(DIAS, { fecha: "2026-10-25", hora: "basura" }), { fecha: "2026-10-23", hora: null });
  assert.deepEqual(inicioDeLaCinta([], {}), { fecha: "", hora: null });
});

test("M-097: se ocupó la de las 18 → el chip se va y se sugieren 17 y 19", () => {
  const sin = sinLaHora(DIAS, iso("2026-10-23", 18));
  assert.deepEqual(sin[0].horas, [iso("2026-10-23", 17), iso("2026-10-23", 19)]);
  assert.deepEqual(cercanas(sin, iso("2026-10-23", 18), 2), [iso("2026-10-23", 17), iso("2026-10-23", 19)]);
  // Las del servidor sólo si siguen en la cinta, a lo sumo 2.
  assert.deepEqual(alternativasEnCinta(sin, [iso("2026-10-23", 18), iso("2026-10-23", 19), iso("2026-10-24", 10), iso("2026-10-27", 19)]), [iso("2026-10-23", 19), iso("2026-10-24", 10)]);
  // Un día que queda vacío se va de la cinta.
  assert.equal(sinLaHora(DIAS, iso("2026-10-24", 10)).some((d) => d.fecha === "2026-10-24"), false);
});

test("lo recordado en el teléfono: nombre y celular, nada más; basura → nada", () => {
  assert.deepEqual(leerRecuerdo(JSON.stringify({ nombre: " Juan ", telefono: "11 5555-1234", token: "x" })), { nombre: "Juan", telefono: "11 5555-1234" });
  assert.equal(leerRecuerdo("{"), null);
  assert.equal(leerRecuerdo(JSON.stringify({ nombre: "Juan" })), null);
  assert.equal(leerRecuerdo(null), null);
});

test("M-093: el celular se acepta como venga", () => {
  for (const t of ["+54 9 11 5555-1234", "011 15 5555 1234", "1155551234"]) assert.equal(telefonoAlumno(t), "1155551234", t);
});
