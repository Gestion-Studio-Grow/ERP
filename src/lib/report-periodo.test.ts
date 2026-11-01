import { test } from "node:test";
import assert from "node:assert/strict";
import { contraElAnterior, opcionesDePeriodo, periodoDeLaUrl, rangoDelAnterior, resolverPeriodo } from "./report-periodo";

test("este mes va del día 1 a hoy", () => {
  const p = resolverPeriodo("mes", "2026-11-15");
  assert.equal(p.ultimoDia, "2026-11-15");
  assert.equal(p.dias, 15);
  assert.equal(p.cerrado, false);
  assert.equal(p.query, "periodo=mes");
});

test("mes pasado es el mes entero, y cerrado, también en febrero y al cambiar de año", () => {
  const feb = resolverPeriodo("mes-pasado", "2026-03-31");
  assert.equal(feb.ultimoDia, "2026-02-28");
  assert.equal(feb.dias, 28);
  assert.equal(feb.cerrado, true);
  const dic = resolverPeriodo("mes-pasado", "2027-01-01");
  assert.equal(dic.ultimoDia, "2026-12-31");
  assert.equal(dic.dias, 31);
});

test("el primer día del mes, este mes es un solo día", () => {
  const p = resolverPeriodo("mes", "2026-11-01");
  assert.equal(p.dias, 1);
  assert.equal(p.anterior.ultimoDia, "2026-10-31");
  assert.equal(rangoDelAnterior(p), "31/10");
});

test("un rango móvil termina hoy y uno inventado cae al de siempre", () => {
  assert.equal(resolverPeriodo(30, "2026-11-01").etiqueta, "30 días");
  assert.equal(resolverPeriodo(365, "2026-11-01").etiqueta, "1 año");
  assert.equal(resolverPeriodo(7, "2026-11-01").dias, 90);
  assert.equal(resolverPeriodo(Number.NaN, "2026-11-01").dias, 90);
});

test("el período anterior termina justo antes y tiene el mismo largo", () => {
  const p = resolverPeriodo(30, "2026-11-01");
  assert.deepEqual(p.anterior, { ultimoDia: "2026-10-02", dias: 30 });
  assert.equal(rangoDelAnterior(p), "03/09 al 02/10");
  assert.equal(rangoDelAnterior(resolverPeriodo(180, "2026-11-01")), "07/11/25 al 05/05/26", "si cruza de año, lo dice");
});

test("la URL: periodo manda, dias sigue andando y lo demás cae al de siempre", () => {
  assert.equal(periodoDeLaUrl({ periodo: "mes" }), "mes");
  assert.equal(periodoDeLaUrl({ periodo: "mes-pasado", dias: "30" }), "mes-pasado");
  assert.equal(periodoDeLaUrl({ dias: "30" }), 30);
  assert.equal(resolverPeriodo(periodoDeLaUrl({ periodo: "<script>" }), "2026-11-01").dias, 90);
  assert.equal(resolverPeriodo(periodoDeLaUrl({}), "2026-11-01").dias, 90);
});

test("el selector ofrece los meses primero y cada opción se pide distinto", () => {
  const o = opcionesDePeriodo("2026-11-15");
  assert.deepEqual(o.map((p) => p.etiqueta), ["Este mes", "Mes pasado", "30 días", "90 días", "180 días", "1 año"]);
  assert.equal(new Set(o.map((p) => p.query)).size, o.length);
});

test("la comparación: más, menos, igual, y sin nada antes no hay porcentaje", () => {
  assert.deepEqual(contraElAnterior(112, 100), { texto: "12 % más", tono: "sube" });
  assert.deepEqual(contraElAnterior(50, 100), { texto: "50 % menos", tono: "baja" });
  assert.deepEqual(contraElAnterior(100, 100), { texto: "Igual", tono: "igual" });
  assert.equal(contraElAnterior(100, 0), null);
});
