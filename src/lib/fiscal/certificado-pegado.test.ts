// Revisión inmediata del certificado pegado o subido (criollo, sin viaje al servidor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { revisarArchivoCertificado, revisarCertificadoPegado } from "./certificado-pegado";

const CERT = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

test("pegado: vacío no dice nada; el certificado completo pasa", () => {
  assert.deepEqual(revisarCertificadoPegado("  "), { ok: null });
  assert.deepEqual(revisarCertificadoPegado(CERT), { ok: true });
  assert.deepEqual(revisarCertificadoPegado("A".repeat(200)), { ok: true });
});

test("pegado: confusiones típicas, en criollo", () => {
  const pedido = revisarCertificadoPegado("-----BEGIN CERTIFICATE REQUEST-----\nx\n-----END CERTIFICATE REQUEST-----");
  assert.equal(pedido.ok, false);
  assert.match((pedido as { motivo: string }).motivo, /pedido de certificado/);
  assert.match((revisarCertificadoPegado("-----BEGIN PRIVATE KEY-----") as { motivo: string }).motivo, /clave privada/);
  assert.match((revisarCertificadoPegado("-----BEGIN CERTIFICATE-----\nMII") as { motivo: string }).motivo, /Falta el final/);
  assert.equal(revisarCertificadoPegado("hola").ok, false);
  assert.equal(revisarCertificadoPegado("x".repeat(70 * 1024)).ok, false);
});

test("archivo: .crt pasa; .csr y otros no", () => {
  assert.deepEqual(revisarArchivoCertificado("gsg-erp.crt", 2000), { ok: true });
  assert.match((revisarArchivoCertificado("pedido.csr", 900) as { motivo: string }).motivo, /\.crt/);
  assert.equal(revisarArchivoCertificado("foto.jpg", 900).ok, false);
  assert.equal(revisarArchivoCertificado("a.crt", 70 * 1024).ok, false);
  assert.deepEqual(revisarArchivoCertificado("", 0), { ok: null });
});
