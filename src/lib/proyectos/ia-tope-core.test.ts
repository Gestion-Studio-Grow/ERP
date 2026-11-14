import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costoMicroUsd,
  entraEnElTope,
  gastoALiquidar,
  leerTopeUsd,
  MARGEN_TOKENS_ENTRADA,
  MAX_TOKENS_POR_CAMPO,
  mesDeIA,
  precioDe,
  precioMaximo,
  PRECIOS_MICRO_USD_POR_MTOK,
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
});

test("liquidación (cert. T4 · 1): `usage` ilegible liquida el ESTIMADO, nunca 0", () => {
  const base = { estimado: BigInt(999_999), modeloPedido: "claude-opus-5-5" };
  const con = (uso: unknown) => gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso: uso as never, modelo: "claude-opus-5-5" } });
  const malos: [string, unknown][] = [
    ["vacío", {}],
    ["sin salida", { input_tokens: 1000 }],
    ["sin entrada", { output_tokens: 1000 }],
    ["entrada negativa", { input_tokens: -100, output_tokens: 1000 }],
    ["salida en texto", { input_tokens: 100, output_tokens: "999" }],
    ["decimal", { input_tokens: 10.5, output_tokens: 10 }],
    ["NaN", { input_tokens: Number.NaN, output_tokens: 10 }],
    ["infinito", { input_tokens: Number.POSITIVE_INFINITY, output_tokens: 10 }],
    ["null", { input_tokens: null, output_tokens: null }],
    ["caché negativa", { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: -1 }],
    ["caché en texto", { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: "5" }],
    ["no es objeto", "usage"],
  ];
  for (const [nombre, uso] of malos) assert.equal(con(uso), BigInt(999_999), nombre);
  // Legible: ceros valen (una respuesta vacía de verdad no cuesta nada), y la caché ausente o null es 0.
  assert.equal(con({ input_tokens: 0, output_tokens: 0 }), BigInt(0));
  assert.equal(con({ input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: null }), BigInt(30_000));
  // Gigante: se topea por campo, sin desbordar ni dar Infinity (1e300 es entero para JS).
  const techo = con({ input_tokens: 1e300, output_tokens: Number.MAX_SAFE_INTEGER });
  assert.equal(techo, costoMicroUsd("claude-opus-5-5", MAX_TOKENS_POR_CAMPO, MAX_TOKENS_POR_CAMPO));
  assert.ok(techo > BigInt(999_999), "el techo cobra caro: a favor de no pasarse");
});

test("liquidación (cert. T4 · 2): si respondió un modelo sin precio (o no dijo cuál), se cobra el MÁXIMO de la tabla", () => {
  const max = precioMaximo();
  for (const p of Object.values(PRECIOS_MICRO_USD_POR_MTOK)) {
    assert.ok(max.entrada >= p.entrada && max.salida >= p.salida);
  }
  const esperado = (BigInt(1000) * max.entrada + BigInt(1000) * max.salida + BigInt(999_999)) / BigInt(1_000_000);
  const base = { estimado: BigInt(1), modeloPedido: "claude-opus-5-5" };
  const uso = { input_tokens: 1000, output_tokens: 1000 };
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso, modelo: "claude-otro-modelo-caro" } }), esperado);
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso } }), esperado, "sin `model` en la respuesta");
  assert.equal(gastoALiquidar({ ...base, resultado: { tipo: "respuesta", uso, modelo: 42 } }), esperado, "`model` que no es texto");
  // El modelo que respondió, si tiene precio, manda (aunque el pedido fuera otro).
  assert.equal(gastoALiquidar({ ...base, modeloPedido: "otro", resultado: { tipo: "respuesta", uso, modelo: "claude-opus-5-5" } }), BigInt(30_000));
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
