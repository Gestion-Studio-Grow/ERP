import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { botonAgendar } from "./boton";

test("B1/M-026: Agendar arranca sin alumno elegido y el botón dice «Elegí el alumno»", () => {
  assert.deepEqual(botonAgendar({ nuevo: false, alumnoId: "", pendiente: false }), { disabled: true, texto: "Elegí el alumno" });
  assert.deepEqual(botonAgendar({ nuevo: false, alumnoId: "al_1", pendiente: false }), { disabled: false, texto: "Agendar" });
  assert.deepEqual(botonAgendar({ nuevo: true, alumnoId: "", pendiente: false }), { disabled: false, texto: "Agendar" }, "alumno nuevo: valida el servidor");
  assert.deepEqual(botonAgendar({ nuevo: false, alumnoId: "al_1", pendiente: true }), { disabled: true, texto: "Agendando…" });
});

test("B1: el selector arranca en la opción vacía «Elegí el alumno», no en un alumno real", () => {
  const form = readFileSync(new URL("./AgendarForm.tsx", import.meta.url), "utf8");
  assert.match(form, /useState\(""\)/, "el alumno elegido arranca vacío");
  assert.match(form, /<option value="" disabled>Elegí el alumno<\/option>/);
  assert.match(form, /value=\{alumnoId\}/, "el select es controlado por ese estado");
});
