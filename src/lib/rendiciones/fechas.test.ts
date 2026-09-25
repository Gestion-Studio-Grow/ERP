// Tests de fechas ISO y períodos: validación, días de calendario y formatos. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { aamm, diasEntre, esFechaIso, estaEnPeriodo, formatearFecha, nombrePeriodo } from "./fechas";

test("esFechaIso: formato AAAA-MM-DD y fecha real de calendario", () => {
  assert.equal(esFechaIso("2026-09-24"), true);
  assert.equal(esFechaIso("2024-02-29"), true); // bisiesto
  assert.equal(esFechaIso("2026-02-29"), false);
  assert.equal(esFechaIso("2026-09-31"), false);
  assert.equal(esFechaIso("2026-13-01"), false);
  assert.equal(esFechaIso("2026-00-10"), false);
  assert.equal(esFechaIso("20260924"), false);
  assert.equal(esFechaIso("24/09/2026"), false);
  assert.equal(esFechaIso(""), false);
});

test("diasEntre: días de calendario, sin depender del huso horario", () => {
  assert.equal(diasEntre("2026-09-01", "2026-09-24"), 23);
  assert.equal(diasEntre("2026-09-24", "2026-09-24"), 0);
  assert.equal(diasEntre("2026-09-24", "2026-09-01"), -23);
  assert.equal(diasEntre("2026-08-31", "2026-09-01"), 1);
  assert.equal(diasEntre("2024-02-28", "2024-03-01"), 2); // bisiesto
  assert.equal(diasEntre("2025-12-31", "2026-01-01"), 1);
});

test("estaEnPeriodo y aamm", () => {
  assert.equal(estaEnPeriodo("2026-09-30", "2026-09"), true);
  assert.equal(estaEnPeriodo("2026-10-01", "2026-09"), false);
  assert.equal(estaEnPeriodo("2026-09", "2026-09"), false);
  assert.equal(aamm("2026-09"), "2609");
  assert.equal(aamm("2030-01"), "3001");
});

test("formatearFecha y nombrePeriodo, para mensajes", () => {
  assert.equal(formatearFecha("2026-09-24"), "24/09/2026");
  assert.equal(nombrePeriodo("2026-09"), "septiembre de 2026");
  assert.equal(nombrePeriodo("2027-01"), "enero de 2027");
});
