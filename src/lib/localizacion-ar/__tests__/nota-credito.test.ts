// QA de notas de crédito (cálculo puro; el pipeline se prueba en homologación).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularComprobante,
  calcularNotaCredito,
  type ReceptorInput,
} from "../calculo-fiscal";
import { codigoCbteTipo } from "../comprobante-arca";

const factura = (cond: Parameters<typeof calcularComprobante>[0], receptor?: ReceptorInput) =>
  calcularComprobante(cond, [{ importe: 121000, alicuota: "21", incluyeIva: true }], receptor);

test("NC de Factura B -> NOTA_CREDITO_B, mismos importes y desglose", () => {
  const f = factura("RESPONSABLE_INSCRIPTO"); // B a consumidor final
  const nc = calcularNotaCredito(f);
  assert.equal(nc.tipo, "NOTA_CREDITO_B");
  assert.equal(nc.neto, f.neto);
  assert.equal(nc.iva, f.iva);
  assert.equal(nc.total, f.total);
  assert.deepEqual(nc.ivaDetalle, f.ivaDetalle);
});

test("NC de Factura A -> NOTA_CREDITO_A (CbteTipo 3), conserva receptor", () => {
  const f = factura("RESPONSABLE_INSCRIPTO", {
    condicionIva: "RESPONSABLE_INSCRIPTO",
    tipoDoc: "CUIT",
    nroDoc: "33-69345023-9",
  });
  assert.equal(f.tipo, "FACTURA_A");
  const nc = calcularNotaCredito(f);
  assert.equal(nc.tipo, "NOTA_CREDITO_A");
  assert.equal(codigoCbteTipo(nc.tipo), 3);
  assert.equal(nc.receptorNroDoc, "33-69345023-9");
});

test("NC de Factura C -> NOTA_CREDITO_C (CbteTipo 13)", () => {
  const f = factura("MONOTRIBUTO");
  const nc = calcularNotaCredito(f);
  assert.equal(nc.tipo, "NOTA_CREDITO_C");
  assert.equal(codigoCbteTipo(nc.tipo), 13);
  assert.equal(nc.iva, 0);
});

test("NC de una NC no vuelve a factura (idempotencia de letra)", () => {
  const f = factura("RESPONSABLE_INSCRIPTO");
  const nc1 = calcularNotaCredito(f);
  const nc2 = calcularNotaCredito(nc1);
  assert.equal(nc2.tipo, "NOTA_CREDITO_B");
});
