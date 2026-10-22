// El resumen al pie de Agendar y su botón (M-053/M-055).

import { test } from "node:test";
import assert from "node:assert/strict";
import { botonAgendar, etiquetaDia, textoResumen } from "./resumen";

const base = { tipo: "INDIVIDUAL" as const, personas: 1, precio: 25000, hoy: "2026-10-23" };

test("el resumen: primer nombre · día · hora · precio", () => {
  assert.equal(textoResumen({ ...base, alumno: "Juan Pérez", fecha: "2026-10-24", hora: "19:00" }), "Juan · Mañana · 19:00 · $25.000");
  assert.equal(textoResumen({ ...base, alumno: "Lucía", fecha: "2026-10-27", hora: "18:00" }), "Lucía · mar 27 · 18:00 · $25.000");
});

test("el resumen con amigos dice cuántos y el total", () => {
  assert.equal(
    textoResumen({ ...base, tipo: "GRUPAL", personas: 3, precio: 36000, alumno: "Ana", fecha: "2026-10-23", hora: "10:00" }),
    "Ana · Hoy · 10:00 · Con amigos (3) · $36.000",
  );
});

test("M-056: con día y hora puestos y sin alumno, el resumen ya dice día y hora", () => {
  assert.equal(textoResumen({ ...base, fecha: "2026-10-23", hora: "18:00" }), "Hoy · 18:00 · $25.000");
  assert.equal(textoResumen({ ...base }), "", "sin nada elegido no dice nada");
  assert.equal(textoResumen({ ...base, alumno: "Juan", precio: 0 }), "Juan", "sin precio no muestra $ 0");
});

test("etiquetaDia: Hoy, Mañana y el día corto", () => {
  assert.equal(etiquetaDia("2026-10-23", "2026-10-23"), "Hoy");
  assert.equal(etiquetaDia("2026-10-24", "2026-10-23"), "Mañana");
  assert.equal(etiquetaDia("2026-10-30", "2026-10-23"), "vie 30");
});

test("M-053: sin alumno el botón está apagado y dice «Elegí el alumno»; después pide la hora", () => {
  assert.deepEqual(botonAgendar({ alumno: false, hora: true, pendiente: false }), { disabled: true, texto: "Elegí el alumno" });
  assert.deepEqual(botonAgendar({ alumno: false, hora: false, pendiente: false }), { disabled: true, texto: "Elegí el alumno" });
  assert.deepEqual(botonAgendar({ alumno: true, hora: false, pendiente: false }), { disabled: true, texto: "Elegí la hora" });
  assert.deepEqual(botonAgendar({ alumno: true, hora: true, pendiente: false }), { disabled: false, texto: "Agendar y avisar" });
  assert.deepEqual(botonAgendar({ alumno: true, hora: true, pendiente: true }), { disabled: true, texto: "Agendando…" });
});
