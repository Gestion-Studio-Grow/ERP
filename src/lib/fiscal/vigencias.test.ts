// Tests de la tabla de montos fiscales con vigencia (R0-F4). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MONTO_MINIMO_FCE_MIPYME,
  TABLAS_DE_VIGENCIAS,
  UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL,
  diasEntre,
  normalizarFecha,
  problemasDeLaTabla,
  tablaSana,
  vigenteEn,
  type TablaVigencias,
} from "@/lib/fiscal/vigencias";

test("las tablas cargadas están sanas (fechas crecientes, montos > 0, norma y fuente)", () => {
  for (const tabla of TABLAS_DE_VIGENCIAS) {
    assert.deepEqual(problemasDeLaTabla(tabla), [], tabla.id);
  }
});

test("las tablas cargadas están congeladas: nadie las cambia en ejecución", () => {
  for (const tabla of TABLAS_DE_VIGENCIAS) {
    assert.ok(Object.isFrozen(tabla), tabla.id);
    assert.ok(Object.isFrozen(tabla.vigencias), tabla.id);
    for (const fila of tabla.vigencias) assert.ok(Object.isFrozen(fila), `${tabla.id} ${fila.desde}`);
    assert.equal(tablaSana(tabla), true, tabla.id);
  }
});

test("tabla mal cargada: vigenteEn no devuelve ningún monto (null, no 'sin tope')", () => {
  const base = { norma: "n", fuente: "f", verificacion: "v" };
  const desordenada: TablaVigencias = {
    id: "rota",
    nombre: "rota",
    comparacion: "igual_o_superior",
    vigencias: [
      { ...base, desde: "2026-01-01", valor: 200 },
      { ...base, desde: "2025-01-01", valor: 100 },
    ],
  };
  assert.equal(tablaSana(desordenada), false);
  assert.equal(vigenteEn(desordenada, "20260924"), null);
  const enCero: TablaVigencias = { ...desordenada, vigencias: [{ ...base, desde: "2025-01-01", valor: 0 }] };
  assert.equal(vigenteEn(enCero, "20260924"), null);
  const sinNorma = [{ desde: "2025-01-01", valor: 100 }] as unknown as TablaVigencias["vigencias"];
  assert.equal(vigenteEn(sinNorma, "20260924"), null, "una lista suelta también se controla");
  assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME.vigencias, "20260924")?.valor, 5_549_862, "lista sana: responde");
});

test("RG 5700/2025: $10.000.000 desde el 29/05/2025, y antes no hay dato (no se inventa)", () => {
  assert.equal(vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, "20250529")?.valor, 10_000_000);
  assert.equal(vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, "2026-09-24")?.norma, "RG ARCA 5700/2025");
  assert.equal(vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, "20250528"), null);
});

test("FCE MiPyME: el monto que rige depende de la fecha (cambio del 14/04/2026)", () => {
  assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME, "20250410"), null, "antes de la primera fila: sin dato");
  assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME, "20250411")?.valor, 3_958_316);
  assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME, "20260413")?.valor, 3_958_316, "el día anterior rige el viejo");
  assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME, "20260414")?.valor, 5_549_862, "el día de inicio ya rige el nuevo");
  assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME, "2026-09-24")?.valor, 5_549_862);
});

test("una fila nueva no cambia lo decidido con fecha anterior", () => {
  const conFutura: TablaVigencias = {
    ...MONTO_MINIMO_FCE_MIPYME,
    vigencias: [
      ...MONTO_MINIMO_FCE_MIPYME.vigencias,
      { desde: "2027-04-14", valor: 7_000_000, norma: "prueba", fuente: "prueba", verificacion: "prueba" },
    ],
  };
  assert.deepEqual(problemasDeLaTabla(conFutura), []);
  assert.equal(vigenteEn(conFutura, "20260924")?.valor, 5_549_862);
  assert.equal(vigenteEn(conFutura, "20270414")?.valor, 7_000_000);
});

test("fecha inválida → null (nunca 'sin tope')", () => {
  for (const f of ["", "hoy", "20260230", "2026-13-01", "2026-9-1", null, undefined]) {
    assert.equal(vigenteEn(MONTO_MINIMO_FCE_MIPYME, f), null, String(f));
  }
});

test("problemasDeLaTabla detecta cada defecto", () => {
  const base = { norma: "n", fuente: "f", verificacion: "v" };
  const t = (vigencias: TablaVigencias["vigencias"]): TablaVigencias => ({
    id: "t",
    nombre: "t",
    comparacion: "igual_o_superior",
    vigencias,
  });
  assert.equal(problemasDeLaTabla(t([])).length, 1, "vacía");
  assert.match(problemasDeLaTabla(t([{ ...base, desde: "20250101", valor: 1 }]))[0], /AAAA-MM-DD/);
  assert.match(problemasDeLaTabla(t([{ ...base, desde: "2025-02-30", valor: 1 }]))[0], /no es una fecha/);
  assert.match(
    problemasDeLaTabla(
      t([
        { ...base, desde: "2025-02-01", valor: 1 },
        { ...base, desde: "2025-01-01", valor: 2 },
      ]),
    )[0],
    /más vieja a la más nueva/,
  );
  assert.match(
    problemasDeLaTabla(
      t([
        { ...base, desde: "2025-01-01", valor: 1 },
        { ...base, desde: "2025-01-01", valor: 2 },
      ]),
    )[0],
    /sin repetir fecha/,
  );
  assert.match(problemasDeLaTabla(t([{ ...base, desde: "2025-01-01", valor: 0 }]))[0], /mayor a cero/);
  assert.match(problemasDeLaTabla(t([{ ...base, desde: "2025-01-01", valor: Number.NaN }]))[0], /mayor a cero/);
  assert.match(problemasDeLaTabla(t([{ ...base, norma: " ", desde: "2025-01-01", valor: 1 }]))[0], /norma/);
  assert.match(problemasDeLaTabla(t([{ ...base, fuente: "", desde: "2025-01-01", valor: 1 }]))[0], /fuente/);
  assert.match(problemasDeLaTabla(t([{ ...base, verificacion: "", desde: "2025-01-01", valor: 1 }]))[0], /verificó/);
});

test("normalizarFecha acepta AAAAMMDD y AAAA-MM-DD y rechaza fechas que no existen", () => {
  assert.equal(normalizarFecha("20260924"), "20260924");
  assert.equal(normalizarFecha(" 2026-09-24 "), "20260924");
  assert.equal(normalizarFecha("20240229"), "20240229", "bisiesto");
  assert.equal(normalizarFecha("20250229"), null, "no bisiesto");
  assert.equal(normalizarFecha("2026-00-10"), null);
  assert.equal(normalizarFecha("2026-01-00"), null);
  assert.equal(normalizarFecha("26-09-24"), null);
  assert.equal(normalizarFecha("2026/09/24"), null);
});

test("diasEntre cuenta días de calendario, cruzando meses y años", () => {
  assert.equal(diasEntre("20260924", "20260924"), 0);
  assert.equal(diasEntre("20260924", "20260929"), 5);
  assert.equal(diasEntre("20260929", "20260924"), -5);
  assert.equal(diasEntre("20261228", "20270107"), 10);
  assert.equal(diasEntre("20240228", "20240301"), 2, "29 de febrero bisiesto");
});
