// ADR-101 · UN SOLO ESPERADO para el cajón — las reglas puras (los tests contra Postgres están en
// `un-solo-esperado-*-postgres.test.ts`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APERTURA_TURNO_ACTOR_PREFIX,
  ARQUEO_TURNO_ACTOR_PREFIX,
  aperturaTurnoMarker,
  diferenciaDeApertura,
} from "@/lib/caja/cierre-marca";
import { arqueoContraElLibro, saldoEfectivoDeTotales } from "@/lib/caja/saldo-cajon";
import { clasificarOrigen, motivoParaNoBorrar } from "@/lib/caja/libro-caja";

test("fondo contado igual al libro ⇒ la apertura no escribe diferencia", () => {
  assert.equal(diferenciaDeApertura(2_500.5, 2_500.5, "cs_1"), null);
  assert.equal(diferenciaDeApertura(0, 0, "cs_1"), null);
  // Medio centavo de ruido de coma flotante no es una diferencia.
  assert.equal(diferenciaDeApertura(0.1 + 0.2, 0.3, "cs_1"), null);
});

test("el cajón tiene menos que el libro ⇒ faltante al abrir (EGRESO en efectivo), con la marca del turno", () => {
  const d = diferenciaDeApertura(0, 12_345.67, "cs_1");
  assert.deepEqual(d, {
    type: "EGRESO",
    method: "EFECTIVO",
    amount: 12_345.67,
    reason: "Faltante al abrir el turno: el cajón tenía menos que el libro",
    createdBy: "apertura-turno:cs_1",
  });
});

test("el cajón tiene más que el libro ⇒ sobrante al abrir (INGRESO en efectivo)", () => {
  const d = diferenciaDeApertura(5_000, 4_000, "cs_2");
  assert.equal(d?.type, "INGRESO");
  assert.equal(d?.amount, 1_000);
  assert.equal(d?.createdBy, aperturaTurnoMarker("cs_2"));
});

test("un libro en negativo (datos viejos) se corrige hasta el conteo", () => {
  assert.equal(diferenciaDeApertura(1_000, -500, "cs_3")?.amount, 1_500);
  assert.equal(diferenciaDeApertura(1_000, -500, "cs_3")?.type, "INGRESO");
});

test("montos ilegibles no escriben nada", () => {
  assert.equal(diferenciaDeApertura(Number.NaN, 10, "cs"), null);
  assert.equal(diferenciaDeApertura(10, Number.POSITIVE_INFINITY, "cs"), null);
});

test("la marca de apertura no se confunde con la del arqueo", () => {
  assert.notEqual(APERTURA_TURNO_ACTOR_PREFIX, ARQUEO_TURNO_ACTOR_PREFIX);
  assert.ok(!aperturaTurnoMarker("x").startsWith(ARQUEO_TURNO_ACTOR_PREFIX));
});

test("el saldo en efectivo del libro: entra VENTA/INGRESO, sale EGRESO/RETIRO, la APERTURA no mueve, los otros medios no cuentan", () => {
  const saldo = saldoEfectivoDeTotales([
    { type: "VENTA", method: "EFECTIVO", _sum: { amount: 12_345.67 } },
    { type: "INGRESO", method: "EFECTIVO", _sum: { amount: 1_000 } },
    { type: "EGRESO", method: "EFECTIVO", _sum: { amount: 300.25 } },
    { type: "RETIRO", method: "EFECTIVO", _sum: { amount: 50_000 } },
    { type: "APERTURA", method: "EFECTIVO", _sum: { amount: 20_000 } },
    { type: "VENTA", method: "MP", _sum: { amount: 9_999 } },
    { type: "VENTA", method: "EFECTIVO", _sum: { amount: null } },
  ]);
  assert.equal(saldo, -36_954.58, "12.345,67 + 1.000 − 300,25 − 50.000: un libro en rojo también se cuenta");
});

test("el arqueo del turno se hace contra el libro: contado − saldo, al centavo", () => {
  assert.deepEqual(arqueoContraElLibro(3_800, 3_300), { expected: 3_800, counted: 3_300, diff: -500 });
  assert.deepEqual(arqueoContraElLibro(1_000, 1_000), { expected: 1_000, counted: 1_000, diff: 0 });
  assert.deepEqual(arqueoContraElLibro(0.1 + 0.2, 0.3), { expected: 0.3, counted: 0.3, diff: 0 });
});

test("en el libro, la diferencia de apertura es una diferencia de caja del turno y no se borra", () => {
  const fila = { type: "EGRESO" as const, createdBy: aperturaTurnoMarker("cs_9") };
  assert.deepEqual(clasificarOrigen(fila), { origen: "diferencia-caja", referencia: "cs_9" });
  assert.match(motivoParaNoBorrar(fila) ?? "", /diferencia que se encontró al abrir un turno/);
});
