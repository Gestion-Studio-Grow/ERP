import { test } from "node:test";
import assert from "node:assert/strict";
import { diaAnterior, diaCorto, diaLargo, diaMes, diaRelativo, diaSiguiente, diasEntre, mesLargo, nombreMes } from "./fechas";

test("el día largo lleva mayúscula sólo en la primera letra", () => {
  assert.equal(diaLargo("2026-09-24"), "Jueves 24 de septiembre");
  assert.equal(diaLargo("2026-10-01"), "Jueves 1 de octubre");
});

test("el día corto: «jue 24/09»", () => {
  assert.equal(diaCorto("2026-09-24"), "jue 24/09");
  assert.equal(diaMes("2026-09-04"), "04/09");
});

test("vecinos de un día, cruzando el mes y el año", () => {
  assert.equal(diaAnterior("2026-10-01"), "2026-09-30");
  assert.equal(diaSiguiente("2026-12-31"), "2027-01-01");
  assert.equal(diasEntre("2026-09-22", "2026-09-24"), 2);
});

test("relativo a hoy", () => {
  assert.equal(diaRelativo("2026-09-24", "2026-09-24"), "hoy");
  assert.equal(diaRelativo("2026-09-23", "2026-09-24"), "ayer");
  assert.equal(diaRelativo("2026-09-25", "2026-09-24"), "mañana");
  assert.equal(diaRelativo("2026-09-21", "2026-09-24"), "lun 21/09");
});

test("el mes: «Septiembre 2026»", () => {
  assert.equal(mesLargo("2026-09"), "Septiembre 2026");
  assert.equal(nombreMes("2026-01"), "enero");
});
