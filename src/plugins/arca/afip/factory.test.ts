import test from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { crearAfipClient, modoDesdeEnv, configParaModo } from './factory';
import { StubAfipClient } from './stub';
import { SoapAfipClient } from './soap';
import type { EmisorConfig } from './port';

const config: EmisorConfig = { cuit: 20111111112, homologacion: true };

function credencialDeTest() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [{ name: 'commonName', value: 'test' }, { name: 'countryName', value: 'AR' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

test('modoDesdeEnv: default stub, homologacion y real por ARCA_MODO', () => {
  assert.equal(modoDesdeEnv({}), 'stub');
  assert.equal(modoDesdeEnv({ ARCA_MODO: 'homologacion' }), 'homologacion');
  assert.equal(modoDesdeEnv({ ARCA_MODO: 'real' }), 'real');
  assert.equal(modoDesdeEnv({ ARCA_MODO: 'yolo' }), 'stub');
});

test('configParaModo: homologacion fuerza homologacion=true aunque el Tenant diga false', () => {
  const prod: EmisorConfig = { cuit: 20111111112, homologacion: false };
  assert.equal(configParaModo(prod, 'homologacion').homologacion, true);
  assert.equal(configParaModo(prod, 'real').homologacion, false);
  assert.equal(configParaModo(prod, 'stub').homologacion, false);
});

test('sin ARCA_MODO → StubAfipClient', () => {
  assert.ok(crearAfipClient(config, {}) instanceof StubAfipClient);
});

test('ARCA_MODO=real sin credenciales → error explícito de acción humana (NO cae al stub)', () => {
  assert.throws(
    () => crearAfipClient(config, { ARCA_MODO: 'real' }),
    /ARCA_CERT_PEM/,
  );
});

test('ARCA_MODO=homologacion sin credenciales → mismo error explícito (NO cae al stub)', () => {
  assert.throws(
    () => crearAfipClient(config, { ARCA_MODO: 'homologacion' }),
    /ARCA_CERT_PEM/,
  );
});

test('ARCA_MODO=real con cert+clave → adapter SOAP real', () => {
  const { certPem, keyPem } = credencialDeTest();
  const client = crearAfipClient(config, {
    ARCA_MODO: 'real',
    ARCA_CERT_PEM: certPem,
    ARCA_KEY_PEM: keyPem,
  });
  assert.ok(client instanceof SoapAfipClient);
});

test('ARCA_MODO=homologacion con cert+clave → adapter SOAP real, forzado a homologación', () => {
  const { certPem, keyPem } = credencialDeTest();
  const prod: EmisorConfig = { cuit: 20111111112, homologacion: false }; // Tenant en "producción"
  const client = crearAfipClient(prod, {
    ARCA_MODO: 'homologacion',
    ARCA_CERT_PEM: certPem,
    ARCA_KEY_PEM: keyPem,
  });
  assert.ok(client instanceof SoapAfipClient);
});
