// Tests de la política PURA de modificación de turnos (isAppointmentModifiable).
// Sin DB: se inyecta `now` para no depender del reloj. Patrón node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isAppointmentModifiable } from "./booking-core";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const future = new Date("2026-07-10T15:00:00.000Z");
const past = new Date("2026-07-10T09:00:00.000Z");

test("turno pendiente y a futuro → modificable", () => {
  assert.equal(isAppointmentModifiable("PENDING", future, NOW), true);
});

test("turno confirmado y a futuro → modificable", () => {
  assert.equal(isAppointmentModifiable("CONFIRMED", future, NOW), true);
});

test("turno ya pasado → NO modificable aunque esté confirmado", () => {
  assert.equal(isAppointmentModifiable("CONFIRMED", past, NOW), false);
});

test("turno cancelado/completado/no-show → NO modificable", () => {
  for (const s of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
    assert.equal(isAppointmentModifiable(s, future, NOW), false);
  }
});
