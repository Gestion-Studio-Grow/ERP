import test from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import {
  cuitDesdeCertPem,
  vencimientoDesdeCertPem,
  assertCertCoincideConCuit,
  CredencialCuitMismatchError,
} from './cert-inspect';

/** Genera un cert con el CUIT en el `serialNumber` del subject (como ARCA). */
function certConSerial(serialValue: string): string {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 5, 15);
  const attrs = [
    { name: 'commonName', value: 'Emisor Test' },
    { name: 'serialNumber', value: serialValue },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

function certConCN(cnValue: string): string {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [{ name: 'commonName', value: cnValue }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

test('cuitDesdeCertPem: extrae el CUIT del serialNumber "CUIT <11 dígitos>"', () => {
  assert.equal(cuitDesdeCertPem(certConSerial('CUIT 20111111112')), '20111111112');
});

test('cuitDesdeCertPem: tolera guiones en el CUIT', () => {
  assert.equal(cuitDesdeCertPem(certConSerial('CUIT 20-11111111-2')), '20111111112');
});

test('cuitDesdeCertPem: cae al CN si no hay serialNumber con CUIT', () => {
  assert.equal(cuitDesdeCertPem(certConCN('27999999993')), '27999999993');
});

test('cuitDesdeCertPem: PEM inválido → null', () => {
  assert.equal(cuitDesdeCertPem('no soy un pem'), null);
});

test('vencimientoDesdeCertPem: devuelve la fecha notAfter', () => {
  const v = vencimientoDesdeCertPem(certConSerial('CUIT 20111111112'));
  assert.ok(v instanceof Date);
  assert.equal(v!.getFullYear(), 2035);
});

test('assertCertCoincideConCuit: coincide → no lanza', () => {
  assert.doesNotThrow(() => assertCertCoincideConCuit(certConSerial('CUIT 20111111112'), '20111111112'));
});

test('assertCertCoincideConCuit: tolera guiones en el CUIT del tenant', () => {
  assert.doesNotThrow(() => assertCertCoincideConCuit(certConSerial('CUIT 20111111112'), '20-11111111-2'));
});

test('🔒 assertCertCoincideConCuit: CUIT distinto → CredencialCuitMismatchError', () => {
  assert.throws(
    () => assertCertCoincideConCuit(certConSerial('CUIT 20111111112'), '27999999993'),
    (err: unknown) => err instanceof CredencialCuitMismatchError,
  );
});

test('🔒 assertCertCoincideConCuit: cert sin CUIT legible → aborta (no asume que coincide)', () => {
  assert.throws(
    () => assertCertCoincideConCuit(certConCN('Sin Cuit'), '20111111112'),
    (err: unknown) => err instanceof CredencialCuitMismatchError,
  );
});
