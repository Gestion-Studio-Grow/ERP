// Tests del QR de ARCA/AFIP (RG 4291, ADR-026). Dominio puro: arma el payload,
// lo codifica en base64 y devuelve la URL de verificación. Sin I/O.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  URL_QR_AFIP,
  base64QrAfip,
  payloadQrAfip,
  urlQrAfip,
  type DatosQrAfip,
} from "./qr-afip";

const datos: DatosQrAfip = {
  fecha: "20260708",
  cuit: 20111111112,
  puntoVenta: 3,
  tipoComprobante: 6,
  numero: 42,
  importe: 1210.5,
  tipoDocReceptor: 99,
  nroDocReceptor: 0,
  cae: "75123456789012",
};

test("payload: campos y formato oficiales (fecha con guiones, tipoCodAut E)", () => {
  const p = payloadQrAfip(datos);
  assert.equal(p.ver, 1);
  assert.equal(p.fecha, "2026-07-08");
  assert.equal(p.cuit, 20111111112);
  assert.equal(p.ptoVta, 3);
  assert.equal(p.tipoCmp, 6);
  assert.equal(p.nroCmp, 42);
  assert.equal(p.importe, 1210.5);
  assert.equal(p.moneda, "PES");
  assert.equal(p.ctz, 1);
  assert.equal(p.tipoDocRec, 99);
  assert.equal(p.nroDocRec, 0);
  assert.equal(p.tipoCodAut, "E");
  assert.equal(p.codAut, 75123456789012);
});

test("base64 es reversible al JSON del payload", () => {
  const p = payloadQrAfip(datos);
  const b64 = base64QrAfip(p);
  const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  assert.deepEqual(decoded, p);
});

test("url arranca con el endpoint oficial y trae ?p=<base64>", () => {
  const url = urlQrAfip(datos);
  assert.ok(url.startsWith(`${URL_QR_AFIP}?p=`));
  const b64 = url.slice(`${URL_QR_AFIP}?p=`.length);
  const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  assert.equal(decoded.codAut, 75123456789012);
});

test("fecha inválida (no AAAAMMDD) lanza", () => {
  assert.throws(() => payloadQrAfip({ ...datos, fecha: "2026-07-08" }));
});
