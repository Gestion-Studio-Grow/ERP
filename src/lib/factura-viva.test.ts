// ============================================================================
// ENG-023 · ¿La venta tiene una factura viva ante ARCA? (regla pura)
// ============================================================================
//
// Una venta (o un turno) con factura AUTORIZADA no se anula mientras no exista la nota de
// crédito que la cancela: anularla dejaría la factura con su CAE vigente y el libro con la
// devolución, y el IVA de esa venta quedaría declarado sin venta detrás. Una factura EN CAMINO
// (PENDING: el envío a ARCA sigue abierto) frena igual, porque el CAE puede llegar después de
// anular. Una RECHAZADA no tiene CAE: no hay nada que cancelar ante ARCA.

import { test } from "node:test";
import assert from "node:assert/strict";
import { facturaDeLaVenta, mensajeFacturaViva } from "@/lib/factura-viva";

test("una venta sin facturas no tiene factura viva", () => {
  assert.equal(facturaDeLaVenta([]), "sin-factura-viva");
});

test("una factura rechazada por ARCA no tiene CAE: la venta se puede anular", () => {
  assert.equal(facturaDeLaVenta([{ status: "REJECTED" }]), "sin-factura-viva");
});

test("una factura autorizada deja la venta facturada", () => {
  assert.equal(facturaDeLaVenta([{ status: "AUTHORIZED" }]), "autorizada");
});

test("una factura pendiente frena igual: el CAE puede llegar después de anular", () => {
  assert.equal(facturaDeLaVenta([{ status: "PENDING" }]), "en-camino");
});

test("si conviven una rechazada y una autorizada, manda la autorizada", () => {
  assert.equal(facturaDeLaVenta([{ status: "REJECTED" }, { status: "PENDING" }, { status: "AUTHORIZED" }]), "autorizada");
});

test("un estado desconocido se trata como vivo: ante la duda, no se anula", () => {
  assert.equal(facturaDeLaVenta([{ status: "OTRO" }]), "en-camino");
});

test("el mensaje de la factura autorizada explica por qué no se anula y qué hacer", () => {
  const venta = mensajeFacturaViva("autorizada", "venta");
  assert.match(venta, /^Esa venta tiene factura electrónica autorizada por ARCA/);
  assert.match(venta, /nota de crédito/);
  assert.match(venta, /contador/);
  const turno = mensajeFacturaViva("autorizada", "turno");
  assert.match(turno, /^Ese turno tiene factura electrónica autorizada por ARCA/);
});

test("el mensaje de la factura en camino pide esperar la respuesta de ARCA", () => {
  assert.match(mensajeFacturaViva("en-camino", "venta"), /esperá/i);
  assert.match(mensajeFacturaViva("en-camino", "turno"), /^Ese turno/);
});
