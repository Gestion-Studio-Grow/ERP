import { test } from "node:test";
import assert from "node:assert/strict";
import { horasDeLaGrilla } from "./grilla";

const h = (hh: number, mm = 0) => hh * 60 + mm;

test("grilla: sin turnos fuera de hora, de 9 a 19 como siempre", () => {
  assert.deepEqual(horasDeLaGrilla([]), { desde: 9, hasta: 19 });
  assert.deepEqual(horasDeLaGrilla([{ desde: h(10), hasta: h(11) }]), { desde: 9, hasta: 19 });
});

test("grilla: un turno de las 8:15 o que termina 20:30 se ve (antes quedaba afuera)", () => {
  assert.deepEqual(horasDeLaGrilla([{ desde: h(8, 15), hasta: h(9, 15) }]), { desde: 8, hasta: 19 });
  assert.deepEqual(horasDeLaGrilla([{ desde: h(19, 30), hasta: h(20, 30) }]), { desde: 9, hasta: 21 });
});

test("grilla: un turno que cruza la medianoche se corta a las 24", () => {
  assert.deepEqual(horasDeLaGrilla([{ desde: h(23), hasta: h(0, 30) }]), { desde: 9, hasta: 24 });
});
