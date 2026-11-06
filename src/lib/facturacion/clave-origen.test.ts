import { test } from "node:test";
import assert from "node:assert/strict";
import { claveAlmacenada, claveOrigen, leerClaveOrigen, normalizarParaElLibro, ClaveOrigenInvalidaError } from "./clave-origen";
import { claveCobroMP, claveCobroBanco, claveCobroTurno } from "./cobros-facturados";

test("clave de origen: formas canónicas y la que se guarda", () => {
  assert.equal(claveOrigen({ tipo: "mp_payment", id: "123" }), "mp:payment:123");
  assert.equal(claveOrigen({ tipo: "mp_refund", id: "9" }), "mp:refund:9");
  const u = "0b8e7c2a-1f3d-4e5a-9b6c-7d8e9f0a1b2c";
  assert.equal(claveOrigen({ tipo: "manual", id: u }), `manual:${u}`);
  // claveCobroMP es el caso mp_payment, guardado como siempre (`mp:<id>`): no se duplican filas viejas.
  assert.equal(claveAlmacenada({ tipo: "mp_payment", id: "123" }), claveCobroMP("123"));
  assert.equal(claveAlmacenada({ tipo: "turno", id: "t1" }), claveCobroTurno("t1"));
  assert.equal(claveAlmacenada({ tipo: "banco", id: "h" }), claveCobroBanco("h"));
});

test("clave de origen: las dos formas de un pago de MP llevan a la misma fila del libro", () => {
  assert.equal(normalizarParaElLibro("mp:payment:123"), "mp:123");
  assert.equal(normalizarParaElLibro("mp:123"), "mp:123");
  assert.deepEqual(leerClaveOrigen("mp:refund:77"), { tipo: "mp_refund", id: "77" });
  assert.equal(normalizarParaElLibro("mp:refund:77"), "mp:refund:77");
  assert.equal(leerClaveOrigen("otra:1"), null);
});

test("clave de origen: ids vacíos o mal formados no pasan (sin clave se pierde la guarda)", () => {
  assert.throws(() => claveOrigen({ tipo: "mp_payment", id: " " }), ClaveOrigenInvalidaError);
  assert.throws(() => claveOrigen({ tipo: "manual", id: "corta" }), ClaveOrigenInvalidaError);
  assert.throws(() => claveOrigen({ tipo: "manual", id: "a b c d e f g h i j k l" }), ClaveOrigenInvalidaError);
  assert.equal(leerClaveOrigen("manual:x"), null);
  assert.throws(() => normalizarParaElLibro("nada"), ClaveOrigenInvalidaError);
});
