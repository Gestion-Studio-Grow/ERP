import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PATRON_GENERICO,
  bocaEn,
  bocaGenerica,
  duracionLectura,
  elegirVoz,
  escenaEnTiempo,
  parsearVisemas,
} from "./lipsync";

// Fragmento real de `bienvenida.visemas.json` (deploy seidorito-console): así sale de Rhubarb.
const RHUBARB = {
  metadata: { duration: 69 },
  mouthCues: [
    { start: 0, end: 0.17, value: "X" },
    { start: 0.17, end: 0.24, value: "B" },
    { start: 0.24, end: 0.31, value: "E" },
    { start: 0.31, end: 0.39, value: "A" },
    { start: 0.39, end: 0.46, value: "C" },
  ],
};

test("parsearVisemas: toma el JSON de Rhubarb tal cual y descarta lo roto", () => {
  assert.equal(parsearVisemas(RHUBARB).length, 5);
  const sucio = {
    mouthCues: [
      { start: 1, end: 2, value: "C" },
      { start: 0, end: 1, value: "B" },
      { start: 2, end: 2, value: "A" }, // largo cero
      { start: 3, end: 4, value: "Z" }, // forma inexistente
      null,
      { start: "5", end: 6, value: "A" },
    ],
  };
  assert.deepEqual(parsearVisemas(sucio), [
    { start: 0, end: 1, value: "B" },
    { start: 1, end: 2, value: "C" },
  ]);
  assert.deepEqual(parsearVisemas(null), []);
  assert.deepEqual(parsearVisemas({}), []);
});

test("bocaEn: la forma del cue que contiene el instante; fuera de los cues, reposo", () => {
  const cues = parsearVisemas(RHUBARB);
  assert.equal(bocaEn(cues, 0), "X");
  assert.equal(bocaEn(cues, 0.2), "B");
  assert.equal(bocaEn(cues, 0.24), "E"); // el borde pertenece al cue que empieza
  assert.equal(bocaEn(cues, 0.4), "C");
  assert.equal(bocaEn(cues, 10), "X");
  assert.equal(bocaEn([], 1), "X");
});

test("bocaGenerica: recorre el patrón, nunca dos formas iguales seguidas", () => {
  assert.equal(bocaGenerica(0), PATRON_GENERICO[0]);
  assert.equal(bocaGenerica(0.09 * PATRON_GENERICO.length), PATRON_GENERICO[0]);
  assert.equal(bocaGenerica(-1), "X");
  assert.equal(bocaGenerica(Number.NaN), "X");
  for (let i = 0; i < PATRON_GENERICO.length; i++) {
    assert.notEqual(PATRON_GENERICO[i], PATRON_GENERICO[(i + 1) % PATRON_GENERICO.length]);
  }
});

test("duracionLectura: proporcional a las palabras, con piso para frases cortas", () => {
  assert.equal(duracionLectura("Hola"), 2200);
  assert.equal(duracionLectura(Array(26).fill("palabra").join(" ")), 10000);
});

test("escenaEnTiempo: reparte el audio en proporción al largo de cada escena", () => {
  const textos = ["a".repeat(10), "b".repeat(30)];
  assert.equal(escenaEnTiempo(textos, 40, 0), 0);
  assert.equal(escenaEnTiempo(textos, 40, 9.9), 0);
  assert.equal(escenaEnTiempo(textos, 40, 10.1), 1);
  assert.equal(escenaEnTiempo(textos, 40, 99), 1);
  assert.equal(escenaEnTiempo([], 40, 1), -1);
});

test("elegirVoz: rioplatense primero, después cualquier castellano, nunca otro idioma", () => {
  const voces = [
    { lang: "en-US", name: "Samantha" },
    { lang: "es-ES", name: "Mónica", localService: true },
    { lang: "es-AR", name: "Diego" },
  ];
  assert.equal(elegirVoz(voces)?.name, "Diego");
  assert.equal(elegirVoz(voces.slice(0, 2))?.name, "Mónica");
  assert.equal(elegirVoz([{ lang: "en-US", name: "Samantha" }]), null);
});
