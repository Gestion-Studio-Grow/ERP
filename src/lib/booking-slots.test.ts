// Tests de la matemática PURA de disponibilidad (booking-slots.ts): solapes,
// buffer y generación de franjas. Sin DB ni zonas horarias — patrón node:test,
// igual que cash-sale.test.ts. Blindan la regla de oro del negocio de turnos:
// nunca ofrecer ni aceptar una franja que pisa otra (doble-reserva de cancha/box).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  intervalsOverlap,
  withBuffer,
  hasOverlap,
  generateSlots,
  type Interval,
} from "./booking-slots";

const at = (hhmm: string) => new Date(`2026-07-10T${hhmm}:00.000Z`);

test("intervalsOverlap: rangos que se cruzan solapan", () => {
  assert.equal(intervalsOverlap(at("10:00"), at("11:00"), at("10:30"), at("11:30")), true);
});

test("intervalsOverlap: uno contenido en el otro solapa", () => {
  assert.equal(intervalsOverlap(at("10:15"), at("10:45"), at("10:00"), at("11:00")), true);
});

test("intervalsOverlap: turnos pegados (borde estricto) NO solapan", () => {
  // Uno termina 10:00, el otro empieza 10:00 → semiabiertos, no chocan.
  assert.equal(intervalsOverlap(at("09:00"), at("10:00"), at("10:00"), at("11:00")), false);
});

test("intervalsOverlap: rangos separados NO solapan", () => {
  assert.equal(intervalsOverlap(at("09:00"), at("09:30"), at("10:00"), at("11:00")), false);
});

test("withBuffer: expande el rango a cada lado en minutos", () => {
  const r = withBuffer(at("10:00"), at("11:00"), 10);
  assert.equal(r.startsAt.toISOString(), at("09:50").toISOString());
  assert.equal(r.endsAt.toISOString(), at("11:10").toISOString());
});

test("withBuffer: buffer 0 devuelve el mismo rango", () => {
  const r = withBuffer(at("10:00"), at("11:00"), 0);
  assert.equal(r.startsAt.toISOString(), at("10:00").toISOString());
  assert.equal(r.endsAt.toISOString(), at("11:00").toISOString());
});

test("withBuffer: un turno pegado, YA no se toca gracias al buffer", () => {
  // Sin buffer 09:00–10:00 y 10:00–11:00 no chocan; con 10 min de aire, sí.
  const busy = withBuffer(at("09:00"), at("10:00"), 10);
  assert.equal(intervalsOverlap(at("10:00"), at("11:00"), busy.startsAt, busy.endsAt), true);
});

test("hasOverlap: detecta choque contra cualquiera de la lista", () => {
  const busy: Interval[] = [
    { startsAt: at("09:00"), endsAt: at("09:30") },
    { startsAt: at("12:00"), endsAt: at("13:00") },
  ];
  assert.equal(hasOverlap(at("12:30"), at("13:30"), busy), true);
  assert.equal(hasOverlap(at("10:00"), at("11:00"), busy), false);
});

test("generateSlots: día libre, paso 30, duración 60 → franjas parejas", () => {
  const slots = generateSlots({
    dayStart: at("09:00"),
    dayEnd: at("11:00"),
    durationMin: 60,
    stepMin: 30,
    busy: [],
  });
  // 09:00, 09:30, 10:00 (10:00+60=11:00 ≤ cierre); 10:30 se pasaría (11:30 > 11:00).
  assert.deepEqual(slots.map((s) => s.slice(11, 16)), ["09:00", "09:30", "10:00"]);
});

test("generateSlots: no ofrece franjas que se pasan del cierre", () => {
  const slots = generateSlots({
    dayStart: at("09:00"),
    dayEnd: at("10:00"),
    durationMin: 90,
    stepMin: 30,
    busy: [],
  });
  assert.deepEqual(slots, []);
});

test("generateSlots: saltea las franjas que chocan con un turno ocupado", () => {
  const slots = generateSlots({
    dayStart: at("09:00"),
    dayEnd: at("12:00"),
    durationMin: 60,
    stepMin: 60,
    busy: [{ startsAt: at("10:00"), endsAt: at("11:00") }],
  });
  // 09:00 ok; 10:00 choca; 11:00 ok (11:00+60=12:00 ≤ cierre).
  assert.deepEqual(slots.map((s) => s.slice(11, 16)), ["09:00", "11:00"]);
});

test("generateSlots: capacityOk puede vetar una franja libre de choques", () => {
  const slots = generateSlots({
    dayStart: at("09:00"),
    dayEnd: at("12:00"),
    durationMin: 60,
    stepMin: 60,
    busy: [],
    capacityOk: (start) => start.toISOString() !== at("10:00").toISOString(),
  });
  assert.deepEqual(slots.map((s) => s.slice(11, 16)), ["09:00", "11:00"]);
});

test("generateSlots: duración o paso no positivos → sin franjas (no cuelga)", () => {
  assert.deepEqual(
    generateSlots({ dayStart: at("09:00"), dayEnd: at("18:00"), durationMin: 0, stepMin: 30, busy: [] }),
    []
  );
  assert.deepEqual(
    generateSlots({ dayStart: at("09:00"), dayEnd: at("18:00"), durationMin: 60, stepMin: 0, busy: [] }),
    []
  );
});
