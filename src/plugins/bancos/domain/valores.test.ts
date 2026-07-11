// Tests de las utilidades de valores del plugin BANCOS: números formato AR,
// fechas de homebanking, normalización y hash idempotente. Dominio puro.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashMovimiento,
  normalizarTexto,
  parsearFecha,
  parsearNumeroAR,
  redondear2,
} from "./valores";

// --- redondear2 (regla única ADR-057) ----------------------------------------

test("redondear2 es EPSILON-safe en la frontera del medio centavo", () => {
  assert.equal(redondear2(1.005), 1.01); // el Math.round pelado daría 1.00
  assert.equal(redondear2(2.675), 2.68);
  assert.equal(redondear2(10), 10);
});

// --- parsearNumeroAR ----------------------------------------------------------

test("parsea el formato AR completo con símbolo y miles", () => {
  assert.equal(parsearNumeroAR("$ 1.234.567,89"), 1234567.89);
  assert.equal(parsearNumeroAR("1.234,56"), 1234.56);
  assert.equal(parsearNumeroAR("1,50"), 1.5);
});

test("parsea el formato técnico con punto decimal", () => {
  assert.equal(parsearNumeroAR("1234567.89"), 1234567.89);
  assert.equal(parsearNumeroAR("0.5"), 0.5);
});

test("solo punto en grupos de tres es separador de miles", () => {
  assert.equal(parsearNumeroAR("1.234.567"), 1234567);
  assert.equal(parsearNumeroAR("1.234"), 1234);
});

test("negativos: signo y paréntesis contable", () => {
  assert.equal(parsearNumeroAR("-1.234,56"), -1234.56);
  assert.equal(parsearNumeroAR("(1.234,56)"), -1234.56);
  assert.equal(parsearNumeroAR("-$ 500,00"), -500);
});

test("number directo (celda XLSX) pasa redondeado", () => {
  assert.equal(parsearNumeroAR(1234.567), 1234.57);
  assert.equal(parsearNumeroAR(-80), -80);
});

test("lo que no es número devuelve null", () => {
  assert.equal(parsearNumeroAR("SALDO ANTERIOR"), null);
  assert.equal(parsearNumeroAR(""), null);
  assert.equal(parsearNumeroAR("-"), null);
  assert.equal(parsearNumeroAR(null), null);
  assert.equal(parsearNumeroAR(undefined), null);
  assert.equal(parsearNumeroAR("12/05/2026"), null);
});

// --- parsearFecha -------------------------------------------------------------

test("parsea los formatos de fecha de los bancos a AAAAMMDD", () => {
  assert.equal(parsearFecha("05/07/2026"), "20260705");
  assert.equal(parsearFecha("5/7/26"), "20260705");
  assert.equal(parsearFecha("05-07-2026"), "20260705");
  assert.equal(parsearFecha("2026-07-05"), "20260705");
});

test("parsea Date (celda XLSX tipada)", () => {
  assert.equal(parsearFecha(new Date(2026, 6, 5)), "20260705");
});

test("lo que no es fecha plausible devuelve null", () => {
  assert.equal(parsearFecha("32/13/2026"), null);
  assert.equal(parsearFecha("Fecha"), null);
  assert.equal(parsearFecha(""), null);
  assert.equal(parsearFecha(null), null);
  assert.equal(parsearFecha("1.234,56"), null);
});

// --- normalizarTexto ----------------------------------------------------------

test("normaliza acentos, mayúsculas y espacios", () => {
  assert.equal(normalizarTexto("  DESCRIPCIÓN   del  Débito "), "descripcion del debito");
  assert.equal(normalizarTexto("Créditos"), "creditos");
});

// --- hashMovimiento -----------------------------------------------------------

test("el hash es estable e insensible a mayúsculas/acentos de la descripción", () => {
  const a = hashMovimiento("20260705", 1500.5, "Transferencia recibida");
  const b = hashMovimiento("20260705", 1500.5, "  TRANSFERENCIA   RECIBIDA ");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("el hash cambia si cambia fecha, monto o descripción", () => {
  const base = hashMovimiento("20260705", 1500.5, "Transferencia recibida");
  assert.notEqual(hashMovimiento("20260706", 1500.5, "Transferencia recibida"), base);
  assert.notEqual(hashMovimiento("20260705", 1500.51, "Transferencia recibida"), base);
  assert.notEqual(hashMovimiento("20260705", 1500.5, "Otra cosa"), base);
});
