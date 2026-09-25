// Tests de la aprobación por legajo: matriz por importe y centro de costo, suplencias con fecha y
// separación de funciones (nadie aprueba lo propio). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nivelesDeAprobacion, puedeAprobar } from "./aprobacion";
import { PERSONA, rendicion } from "./rendiciones.fixture";
import type { Persona, ReglaAprobacion, Suplencia } from "./tipos";

const persona = (legajo: string, jefeLegajo?: string, centroCosto = "CC-1"): Persona => ({
  ...PERSONA,
  legajo,
  jefeLegajo,
  centroCosto,
});

// 1001 → 2001 → 3001 (dirección, sin jefe); 2002 → 3001.
const P1001 = persona("1001", "2001");
const P2001 = persona("2001", "3001");
const P2002 = persona("2002", "3001");
const P3001 = persona("3001");
const PERSONAS = [P1001, P2001, P2002, P3001];

const REGLAS: ReglaAprobacion[] = [
  { id: "hasta-800k", desde: 0, hasta: 80000000, niveles: ["jefe"] },
  { id: "desde-800k", desde: 80000000, niveles: ["jefe", ["3001"]] },
];

const HOY = "2026-09-24";

test("toma la primera regla que matchea el importe: desde inclusive, hasta exclusive", () => {
  assert.deepEqual(nivelesDeAprobacion(79999999, P1001, PERSONAS, REGLAS, [], HOY), [["2001"]]);
  assert.deepEqual(nivelesDeAprobacion(80000000, P1001, PERSONAS, REGLAS, [], HOY), [["2001"], ["3001"]]);
  assert.deepEqual(nivelesDeAprobacion(0, P1001, PERSONAS, REGLAS, [], HOY), [["2001"]]);
});

test("una regla con centro de costo aplica sólo a ese centro (gana la primera que matchea)", () => {
  const reglas: ReglaAprobacion[] = [
    { id: "logistica", desde: 0, centroCosto: "LOG", niveles: [["2002", "3001"]] },
    { id: "resto", desde: 0, niveles: ["jefe"] },
  ];
  assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, reglas, [], HOY), [["2001"]]);
  assert.deepEqual(nivelesDeAprobacion(1000, persona("1001", "2001", "LOG"), PERSONAS, reglas, [], HOY), [["2002", "3001"]]);
});

test("una suplencia vigente suma al suplente en el mismo nivel (con los bordes incluidos)", () => {
  const suplencias: Suplencia[] = [{ titularLegajo: "2001", suplenteLegajo: "2002", desde: "2026-09-20", hasta: "2026-09-30" }];
  for (const fecha of ["2026-09-20", "2026-09-24", "2026-09-30"]) {
    assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, REGLAS, suplencias, fecha), [["2001", "2002"]], fecha);
  }
  for (const fecha of ["2026-09-19", "2026-10-01"]) {
    assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, REGLAS, suplencias, fecha), [["2001"]], fecha);
  }
});

test("separación de funciones: quien rinde sale de todos los niveles", () => {
  const reglas: ReglaAprobacion[] = [{ id: "fija", desde: 0, niveles: [["2001", "2002"]] }];
  assert.deepEqual(nivelesDeAprobacion(1000, P2001, PERSONAS, reglas, [], HOY), [["2002"]]);
});

test("el suplente que es quien rinde tampoco aprueba", () => {
  const suplencias: Suplencia[] = [{ titularLegajo: "2001", suplenteLegajo: "1001", desde: "2026-09-01", hasta: "2026-09-30" }];
  assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, REGLAS, suplencias, HOY), [["2001"]]);
});

test("nivel vacío: sube al jefe directo; si ya aprueba en otro nivel, al jefe del jefe", () => {
  // Un solo nivel que era quien rinde → su jefe.
  const soloEl: ReglaAprobacion[] = [{ id: "fija", desde: 0, niveles: [["1001"]] }];
  assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, soloEl, [], HOY), [["2001"]]);

  // "jefe" y después quien rinde → el segundo nivel sube al jefe del jefe.
  const jefeYEl: ReglaAprobacion[] = [{ id: "dos", desde: 0, niveles: ["jefe", ["1001"]] }];
  assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, jefeYEl, [], HOY), [["2001"], ["3001"]]);
});

test("el aprobador que sube también suma a su suplente", () => {
  const soloEl: ReglaAprobacion[] = [{ id: "fija", desde: 0, niveles: [["1001"]] }];
  const suplencias: Suplencia[] = [{ titularLegajo: "2001", suplenteLegajo: "2002", desde: "2026-09-01", hasta: "2026-09-30" }];
  assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, soloEl, suplencias, HOY), [["2001", "2002"]]);
});

test("si no hay nadie arriba, el nivel queda vacío ('sin aprobador')", () => {
  assert.deepEqual(nivelesDeAprobacion(1000, P3001, PERSONAS, REGLAS, [], HOY), [[]]);
  assert.deepEqual(nivelesDeAprobacion(90000000, P3001, PERSONAS, REGLAS, [], HOY), [[], []]);
});

test("sin regla que aplique no hay niveles", () => {
  assert.deepEqual(nivelesDeAprobacion(1000, P1001, PERSONAS, [{ id: "x", desde: 5000, niveles: ["jefe"] }], [], HOY), []);
});

test("puedeAprobar: en aprobación, en el nivel en curso y que no sea suya", () => {
  const niveles = [["2001", "2002"], ["3001"]];
  const r = rendicion({ legajo: "1001", estado: "en_aprobacion", nivelActual: 0 });
  assert.equal(puedeAprobar("2001", r, niveles), true);
  assert.equal(puedeAprobar("2002", r, niveles), true);
  assert.equal(puedeAprobar("3001", r, niveles), false);
  assert.equal(puedeAprobar("3001", { ...r, nivelActual: 1 }, niveles), true);
  assert.equal(puedeAprobar("2001", { ...r, estado: "borrador" }, niveles), false);
  assert.equal(puedeAprobar("1001", r, [["1001"]]), false);
  assert.equal(puedeAprobar("2001", { ...r, nivelActual: 5 }, niveles), false);
});
