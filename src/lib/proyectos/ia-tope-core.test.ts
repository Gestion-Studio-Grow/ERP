import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costoMicroUsd,
  entraEnElTope,
  gastoALiquidar,
  leerTopeUsd,
  MARGEN_TOKENS_ENTRADA,
  mesDeIA,
  precioDe,
  tokensEntradaMaximos,
  usd,
} from "./ia-tope-core";

test("costo: redondea hacia arriba; modelo sin precio → null", () => {
  // 1000 de entrada × 5 US$/MTok + 1000 de salida × 25 US$/MTok = 0,03 US$ = 30.000 micro.
  assert.equal(costoMicroUsd("claude-opus-5-5", 1000, 1000), BigInt(30_000));
  assert.equal(costoMicroUsd("claude-opus-5-5", 1, 0), BigInt(5));
  assert.equal(costoMicroUsd("claude-opus-5-5", 0, 0), BigInt(0));
  assert.equal(costoMicroUsd("claude-opus-5-5", -50, Number.NaN), BigInt(0), "basura no resta");
  assert.equal(costoMicroUsd("modelo-desconocido", 10, 10), null);
  assert.equal(precioDe("modelo-desconocido"), null);
});

test("entrada máxima: bytes de UTF-8 + margen (un token nunca pesa menos de un byte)", () => {
  const n = tokensEntradaMaximos({ sistema: "ñ", mensajes: [{ content: "ab" }, { content: "€" }] });
  assert.equal(n, 2 + 2 + 3 + MARGEN_TOKENS_ENTRADA);
  assert.ok(tokensEntradaMaximos({ sistema: "", mensajes: [], esquema: { a: 1 } }) > MARGEN_TOKENS_ENTRADA);
});

test("tope: cuenta gastado + en vuelo + lo nuevo; tope 0 no deja nada", () => {
  assert.equal(entraEnElTope({ tope: BigInt(100), gastado: BigInt(40), reservado: BigInt(30), estimado: BigInt(30) }), true);
  assert.equal(entraEnElTope({ tope: BigInt(100), gastado: BigInt(40), reservado: BigInt(30), estimado: BigInt(31) }), false);
  assert.equal(entraEnElTope({ tope: BigInt(0), gastado: BigInt(0), reservado: BigInt(0), estimado: BigInt(1) }), false);
});

test("liquidación: real con usage, estimado si es incierto, 0 si la API rechazó", () => {
  const base = { estimado: BigInt(999_999), modeloPedido: "claude-opus-5-5" };
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso: { input_tokens: 1000, output_tokens: 1000 } } }), BigInt(30_000));
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso: { input_tokens: 500, cache_read_input_tokens: 500, output_tokens: 1000 } } }), BigInt(30_000));
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso: null } }), BigInt(999_999));
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "incierto" } }), BigInt(999_999));
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "rechazada" } }), BigInt(0));
  // Respondió otro modelo sin precio: se cobra al precio del pedido.
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso: { input_tokens: 1000, output_tokens: 1000 }, modelo: "otro" } }), BigInt(30_000));
});

test("mes de Buenos Aires: el borde de fin de mes es el de Argentina, no el de UTC", () => {
  assert.equal(mesDeIA(new Date("2026-12-01T02:30:00Z")), "2026-11", "30/11 23:30 en BA");
  assert.equal(mesDeIA(new Date("2026-12-01T03:00:00Z")), "2026-12", "1/12 00:00 en BA");
  assert.equal(mesDeIA(new Date("2027-01-01T02:59:59Z")), "2026-12");
});

test("montos: US$ con coma y lectura del formulario", () => {
  assert.equal(usd(BigInt(0)), "US$ 0,00");
  assert.equal(usd(BigInt(12_500_000)), "US$ 12,50");
  assert.equal(usd(BigInt(1)), "US$ 0,01", "lo gastado nunca se muestra de menos");
  assert.equal(leerTopeUsd("12,5"), BigInt(12_500_000));
  assert.equal(leerTopeUsd("US$ 20"), BigInt(20_000_000));
  assert.equal(leerTopeUsd("0"), BigInt(0));
  for (const malo of ["-1", "abc", "1,234", "", "1000001", null]) assert.equal(leerTopeUsd(malo), null, String(malo));
});
