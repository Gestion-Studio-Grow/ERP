// QA de concepto + formateo de fecha ARCA (YYYYMMDD en hora argentina).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codigoConcepto,
  conceptoRequiereFechas,
  formatearFechaArca,
} from "../comprobante-arca";

test("códigos de Concepto de ARCA", () => {
  assert.equal(codigoConcepto("PRODUCTOS"), 1);
  assert.equal(codigoConcepto("SERVICIOS"), 2);
  assert.equal(codigoConcepto("AMBOS"), 3);
});

test("servicios y ambos requieren fechas; productos no", () => {
  assert.equal(conceptoRequiereFechas("SERVICIOS"), true);
  assert.equal(conceptoRequiereFechas("AMBOS"), true);
  assert.equal(conceptoRequiereFechas("PRODUCTOS"), false);
});

test("formatearFechaArca -> YYYYMMDD", () => {
  // 12:00 UTC = 09:00 AR, mismo día.
  assert.equal(formatearFechaArca(new Date("2026-06-15T12:00:00Z")), "20260615");
});

test("formatearFechaArca corrige el borde de medianoche (hora AR)", () => {
  // 02:00 UTC del 15 = 23:00 AR del 14 -> debe dar el 14, no el 15.
  assert.equal(formatearFechaArca(new Date("2026-06-15T02:00:00Z")), "20260614");
});
