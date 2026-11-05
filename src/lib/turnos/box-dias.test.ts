import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boxAbreEseDia,
  correrMes,
  dateComoFecha,
  esFechaValida,
  esMesValido,
  fechaComoDate,
  fechasQueAbre,
  grillaDelMes,
  rangoDelMes,
} from "./box-dias";

test("regla null o casilla sin marcar: abre todos los días (igual que hoy)", () => {
  assert.equal(boxAbreEseDia(null, "2026-11-10"), true);
  assert.equal(boxAbreEseDia({ soloDiasAbiertos: false, abiertos: new Set() }, "2026-11-10"), true);
});

test("con la casilla: sólo las fechas abiertas", () => {
  const regla = { soloDiasAbiertos: true, abiertos: new Set(["2026-11-10", "2026-11-12"]) };
  assert.equal(boxAbreEseDia(regla, "2026-11-10"), true);
  assert.equal(boxAbreEseDia(regla, "2026-11-11"), false);
  assert.deepEqual(fechasQueAbre(regla, ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]), ["2026-11-10", "2026-11-12"]);
  assert.deepEqual(fechasQueAbre({ soloDiasAbiertos: true, abiertos: new Set() }, ["2026-11-10"]), []);
});

test("fecha de pared ↔ columna @db.Date, sin correrse de día", () => {
  assert.equal(fechaComoDate("2026-11-10").toISOString(), "2026-11-10T00:00:00.000Z");
  assert.equal(dateComoFecha(fechaComoDate("2026-12-31")), "2026-12-31");
  assert.equal(esFechaValida("2026-02-30"), false);
  assert.equal(esFechaValida("2026-11-5"), false);
  assert.equal(esFechaValida("2028-02-29"), true);
  assert.throws(() => fechaComoDate("ayer"));
});

test("meses: validación, rango y corrimiento", () => {
  assert.equal(esMesValido("2026-11"), true);
  assert.equal(esMesValido("2026-13"), false);
  assert.deepEqual(rangoDelMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.equal(correrMes("2026-12", 1), "2027-01");
  assert.equal(correrMes("2026-01", -1), "2025-12");
});

test("grilla: semanas de lunes a domingo, todos los días una vez", () => {
  const g = grillaDelMes("2026-11"); // 1/11/2026 es domingo
  assert.ok(g.every((s) => s.length === 7));
  assert.deepEqual(g[0].slice(0, 7), [null, null, null, null, null, null, "2026-11-01"]);
  const dias = g.flat().filter((d): d is string => d !== null);
  assert.equal(dias.length, 30);
  assert.equal(dias[29], "2026-11-30");
});
