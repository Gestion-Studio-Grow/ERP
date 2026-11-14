// El período de la liquidación: claves, bordes en la zona del negocio y el corte que comparten la
// vista previa y `settleCommissions` (T1, docs/producto/comisiones/LIQUIDACION.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessWallTimeToUtc } from "@/lib/datetime";
import {
  TIPO_DE_PERIODO_POR_DEFECTO,
  bordesDelPeriodo,
  entraEnElCorte,
  esDeAntes,
  leerPeriodo,
  periodoAnterior,
  periodoElegido,
  periodoQueContiene,
  periodoSiguiente,
} from "./periodo";

test("mes: claves, días, corte y etiqueta", () => {
  const oct = leerPeriodo("2026-10")!;
  assert.deepEqual([oct.desde, oct.hasta, oct.corte, oct.etiqueta], ["2026-10-01", "2026-10-31", "2026-11-01", "Octubre 2026"]);
  const feb = leerPeriodo("2028-02")!; // bisiesto
  assert.equal(feb.hasta, "2028-02-29");
  assert.equal(leerPeriodo("2026-12")!.corte, "2027-01-01");
});

test("quincena y semana ISO", () => {
  const q1 = leerPeriodo("2026-11-Q1")!;
  assert.deepEqual([q1.desde, q1.hasta, q1.etiqueta], ["2026-11-01", "2026-11-15", "1 al 15 de noviembre 2026"]);
  const q2 = leerPeriodo("2026-02-Q2")!;
  assert.deepEqual([q2.desde, q2.hasta], ["2026-02-16", "2026-02-28"]);
  const w = periodoQueContiene("2026-11-05", "SEMANA"); // jueves
  assert.deepEqual([w.clave, w.desde, w.hasta], ["2026-W45", "2026-11-02", "2026-11-08"]);
  assert.equal(periodoQueContiene("2027-01-01", "SEMANA").clave, "2026-W53"); // 2026 tiene 53 semanas ISO
  assert.equal(leerPeriodo("2026-W53")?.desde, "2026-12-28");
  assert.equal(leerPeriodo("2025-W53"), null, "2025 no tiene semana 53");
});

test("lo que llega de la URL no se adivina", () => {
  for (const raw of ["", null, undefined, "2026-13", "2026-00", "2026-10-Q3", "2026-W00", "octubre", "2026-10; DROP", "1999-01"]) {
    assert.equal(leerPeriodo(raw), null, String(raw));
  }
});

test("anterior y siguiente encadenan sin huecos", () => {
  let p = leerPeriodo("2026-01-Q1")!;
  for (let i = 0; i < 30; i++) {
    const s = periodoSiguiente(p);
    assert.equal(s.desde, p.corte);
    assert.equal(periodoAnterior(s).clave, p.clave);
    p = s;
  }
  assert.equal(periodoAnterior(leerPeriodo("2026-01")!).clave, "2025-12");
});

test("default provisional: MES, y abre en el mes que cerró", () => {
  assert.equal(TIPO_DE_PERIODO_POR_DEFECTO, "MES");
  assert.equal(periodoElegido(undefined, "2026-11-05").clave, "2026-10");
  assert.equal(periodoElegido("basura", "2026-01-03").clave, "2025-12");
  assert.equal(periodoElegido("2026-11-Q1", "2026-11-05").clave, "2026-11-Q1");
  assert.match(readFileSync(new URL("./periodo.ts", import.meta.url), "utf8"), /PROVISIONALES A CONFIRMAR/);
});

test("bordes en la zona del negocio: 23:59 del último día entra, 00:00 del siguiente no", () => {
  const oct = leerPeriodo("2026-10")!;
  const ultimo = businessWallTimeToUtc("2026-10-31", "23:59");
  const siguiente = businessWallTimeToUtc("2026-11-01", "00:00");
  assert.equal(entraEnElCorte(ultimo, oct), true);
  assert.equal(entraEnElCorte(siguiente, oct), false);
  // En UTC el de las 23:59 ya es 1/11: el corte no puede ser en UTC.
  assert.equal(ultimo.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(bordesDelPeriodo(oct).corte.toISOString(), "2026-11-01T03:00:00.000Z");
  // El de antes del período entra igual (saldado tarde), marcado.
  const deSeptiembre = businessWallTimeToUtc("2026-09-30", "23:59");
  assert.equal(entraEnElCorte(deSeptiembre, oct), true);
  assert.equal(esDeAntes(deSeptiembre, oct), true);
  assert.equal(esDeAntes(businessWallTimeToUtc("2026-10-01", "00:00"), oct), false);
});
