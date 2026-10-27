// Lo puro de las hojas: Se suspende, Cancelar, Editar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { afectadasEnVentana, alternarHorario, MOTIVOS_CHIP, pisaOtra, textoPropuesta, ventanaDeSuspension } from "./proponer";

const f = "2026-10-25";
const at = (h: string) => businessWallTimeToUtc(f, h);
const clase = (id: string, h: string, estado = "CONFIRMADA", dur = 60) => ({
  id, nombre: `Alumno ${id}`, estado, empiezaEn: at(h), terminaEn: new Date(at(h).getTime() + dur * 60_000),
});

test("M-036: «Todo el día» se lleva las pedidas y confirmadas que no empezaron, en orden", () => {
  const ahora = at("09:30");
  const lista = [clase("c", "18:00"), clase("a", "09:00"), clase("b", "10:00", "PEDIDA"), clase("d", "12:00", "DADA"), clase("e", "13:00", "CANCELADA")];
  const { desde, hasta } = ventanaDeSuspension("todo", "");
  assert.deepEqual(afectadasEnVentana(lista, f, desde, hasta, ahora).map((c) => c.id), ["b", "c"]);
});

test("«Desde las 17:00» deja afuera lo de antes y agarra la que la cruza", () => {
  const ahora = at("08:00");
  const lista = [clase("a", "16:00"), clase("b", "16:30", "CONFIRMADA", 90), clase("c", "19:00")];
  const { desde, hasta } = ventanaDeSuspension("desde", "17:00");
  assert.deepEqual([desde, hasta], ["17:00", "23:59"]);
  assert.deepEqual(afectadasEnVentana(lista, f, desde, hasta, ahora).map((c) => c.id), ["b", "c"]);
  assert.deepEqual(ventanaDeSuspension("desde", "25:00"), { desde: "00:00", hasta: "23:59" }, "hora inválida = todo el día");
});

test("M-061: los motivos de la hoja Cancelar, en la voz del profe", () => {
  assert.deepEqual(MOTIVOS_CHIP.map((m) => m.etiqueta), ["Lluvia", "Me enfermé", "Club cerrado", "El alumno avisó", "Otro"]);
});

test("M-043: ofrecer hasta 3 horarios, prender y apagar, en orden de hora", () => {
  let e: string[] = [];
  e = alternarHorario(e, "2026-10-25T22:00:00.000Z");
  e = alternarHorario(e, "2026-10-25T20:00:00.000Z");
  assert.deepEqual(e, ["2026-10-25T20:00:00.000Z", "2026-10-25T22:00:00.000Z"]);
  e = alternarHorario(e, "2026-10-26T20:00:00.000Z");
  assert.equal(alternarHorario(e, "2026-10-26T21:00:00.000Z").length, 3, "el cuarto no entra");
  assert.deepEqual(alternarHorario(e, "2026-10-25T20:00:00.000Z"), ["2026-10-25T22:00:00.000Z", "2026-10-26T20:00:00.000Z"]);
});

test("M-064: de 60 a 90 minutos pisa la de las 19:00; 60 no; una cancelada no cuenta", () => {
  const la18 = clase("a", "18:00");
  const otras = [la18, clase("b", "19:00"), clase("c", "20:00", "CANCELADA")];
  assert.equal(pisaOtra(la18, 90, otras)?.id, "b");
  assert.equal(pisaOtra(la18, 60, otras), null, "bordes estrictos");
  assert.equal(pisaOtra(clase("b", "19:00"), 120, [clase("b", "19:00"), clase("c", "20:00", "CANCELADA")]), null);
});

test("M-037: cómo se dice cada propuesta de movida", () => {
  const desde = at("18:00").toISOString();
  assert.equal(textoPropuesta({ nombre: "Lucía Gómez", desde, propuesta: businessWallTimeToUtc("2026-10-26", "19:00").toISOString() }), "18:00 Lucía → lun 26/10 19:00");
  assert.equal(textoPropuesta({ nombre: "Beto", desde, propuesta: null }), "18:00 Beto · no hay hueco cerca");
});
