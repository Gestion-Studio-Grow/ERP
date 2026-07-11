/** Tests de la lógica pura de Facturita: tope mensual y validación del receptor. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoLimite,
  validarEmision,
  LIMITE_FACTURAS_FACTURITA,
} from "@/lib/facturita-core";

test("tope: con 0 usadas puede emitir y no hay mensaje", () => {
  const e = estadoLimite(0);
  assert.equal(e.puedeEmitir, true);
  assert.equal(e.restantes, LIMITE_FACTURAS_FACTURITA);
  assert.equal(e.mensaje, null);
});

test("tope: con 4 usadas avisa que queda 1", () => {
  const e = estadoLimite(4);
  assert.equal(e.puedeEmitir, true);
  assert.match(e.mensaje ?? "", /queda 1 factura/i);
});

test("tope: con 5 usadas bloquea y ofrece el upgrade", () => {
  const e = estadoLimite(5);
  assert.equal(e.puedeEmitir, false);
  assert.match(e.mensaje ?? "", /tope/i);
  assert.match(e.mensaje ?? "", /Comerciante/);
});

test("emisión: sin descripción no pasa", () => {
  const r = validarEmision({ descripcion: "  ", total: 1000 });
  assert.equal(r.ok, false);
});

test("emisión: total cero o negativo no pasa", () => {
  assert.equal(validarEmision({ descripcion: "algo", total: 0 }).ok, false);
  assert.equal(validarEmision({ descripcion: "algo", total: -5 }).ok, false);
});

test("emisión: sin documento es consumidor final (99/0)", () => {
  const r = validarEmision({ descripcion: "venta", total: 1000 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.receptor, { docTipo: 99, docNro: 0 });
});

test("emisión: CUIT válido pasa con guiones o sin", () => {
  const r = validarEmision({ descripcion: "venta", total: 1000, docTipo: 80, docNro: "20-37683309-8" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.receptor.docNro, 20376833098);
});

test("emisión: CUIT con dígito verificador roto no pasa", () => {
  const r = validarEmision({ descripcion: "venta", total: 1000, docTipo: 80, docNro: "20-37683309-9" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /CUIT/);
});

test("emisión: DNI de 7 u 8 dígitos pasa; otro largo no", () => {
  assert.ok(validarEmision({ descripcion: "v", total: 1, docTipo: 96, docNro: "30123456" }).ok);
  assert.ok(validarEmision({ descripcion: "v", total: 1, docTipo: 96, docNro: "3012345" }).ok);
  assert.equal(validarEmision({ descripcion: "v", total: 1, docTipo: 96, docNro: "301234" }).ok, false);
});
