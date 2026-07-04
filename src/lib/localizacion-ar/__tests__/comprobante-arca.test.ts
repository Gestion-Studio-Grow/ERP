// QA del catálogo de códigos ARCA y la selección de letra del comprobante.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codigoCbteTipo,
  codigoDocTipoReceptor,
  formatearNumeroComprobante,
  MONEDA_PES,
} from "../comprobante-arca";
import { calcularComprobante } from "../calculo-fiscal";

// --------------------------------------------------------- códigos CbteTipo
test("CbteTipo de ARCA por tipo de comprobante", () => {
  assert.equal(codigoCbteTipo("FACTURA_A"), 1);
  assert.equal(codigoCbteTipo("FACTURA_B"), 6);
  assert.equal(codigoCbteTipo("FACTURA_C"), 11);
  assert.equal(codigoCbteTipo("NOTA_CREDITO_B"), 8);
  assert.equal(codigoCbteTipo("NOTA_CREDITO_C"), 13);
});

test("DocTipo del receptor y moneda", () => {
  assert.equal(codigoDocTipoReceptor("CUIT"), 80);
  assert.equal(codigoDocTipoReceptor("CUIL"), 86);
  assert.equal(codigoDocTipoReceptor("DNI"), 96);
  assert.equal(codigoDocTipoReceptor("CONSUMIDOR_FINAL"), 99);
  assert.equal(MONEDA_PES.monId, "PES");
  assert.equal(MONEDA_PES.monCotiz, 1);
});

test("formato de número de comprobante 0001-00000123", () => {
  assert.equal(formatearNumeroComprobante(1, 123), "0001-00000123");
  assert.equal(formatearNumeroComprobante(3, 1234567), "0003-01234567");
});

// -------------------------------------------------- selección de letra A/B/C
test("RI a consumidor final -> Factura B", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [
    { importe: 121000, alicuota: "21", incluyeIva: true },
  ]);
  assert.equal(r.tipo, "FACTURA_B");
});

test("RI a otro RI con CUIT válido -> Factura A, receptor con CUIT", () => {
  const r = calcularComprobante(
    "RESPONSABLE_INSCRIPTO",
    [{ importe: 121000, alicuota: "21", incluyeIva: true }],
    { condicionIva: "RESPONSABLE_INSCRIPTO", tipoDoc: "CUIT", nroDoc: "33-69345023-9" },
  );
  assert.equal(r.tipo, "FACTURA_A");
  assert.equal(r.receptorTipoDoc, "CUIT");
  assert.equal(r.receptorNroDoc, "33-69345023-9");
  // A discrimina IVA igual que B.
  assert.equal(r.neto, 100000);
  assert.equal(r.iva, 21000);
});

test("Factura A sin CUIT válido -> lanza (fail-closed)", () => {
  assert.throws(() =>
    calcularComprobante(
      "RESPONSABLE_INSCRIPTO",
      [{ importe: 121000, alicuota: "21", incluyeIva: true }],
      { condicionIva: "RESPONSABLE_INSCRIPTO", tipoDoc: "CUIT", nroDoc: "00-00000000-0" },
    ),
  );
});

test("Monotributo emisor -> Factura C, aunque el receptor sea RI", () => {
  const r = calcularComprobante(
    "MONOTRIBUTO",
    [{ importe: 54450, alicuota: "21", incluyeIva: true }],
    { condicionIva: "RESPONSABLE_INSCRIPTO", tipoDoc: "CUIT", nroDoc: "33-69345023-9" },
  );
  assert.equal(r.tipo, "FACTURA_C");
});
