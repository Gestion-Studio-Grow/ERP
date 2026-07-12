import test from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { crearAfipClient, modoDesdeEnv, configParaModo } from './factory';
import { StubAfipClient } from './stub';
import { SoapAfipClient } from './soap';
import { CredencialCuitMismatchError } from './cert-inspect';
import type { EmisorConfig } from './port';
import type { CredencialEmisor } from './signer';

const CUIT = 20111111112;
const config: EmisorConfig = { cuit: CUIT, homologacion: true };

// Cert de test con el CUIT en el `serialNumber` del subject (como ARCA), así el guard
// fail-closed lo acepta cuando coincide con `config.cuit`.
function credencialDeTest(cuit = CUIT): CredencialEmisor {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [
    { name: 'commonName', value: 'test' },
    { name: 'countryName', value: 'AR' },
    { name: 'serialNumber', value: `CUIT ${cuit}` },
  ];
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
  const prod: EmisorConfig = { cuit: CUIT, homologacion: false };
  assert.equal(configParaModo(prod, 'homologacion').homologacion, true);
  assert.equal(configParaModo(prod, 'real').homologacion, false);
  assert.equal(configParaModo(prod, 'stub').homologacion, false);
});

test('sin ARCA_MODO → StubAfipClient (no requiere credencial)', () => {
  assert.ok(crearAfipClient(config, { env: {} }) instanceof StubAfipClient);
});

test('ARCA_MODO=real sin credencial → error explícito (NO cae al stub ni a un env compartido)', () => {
  assert.throws(
    () => crearAfipClient(config, { env: { ARCA_MODO: 'real' } }),
    /no se pasó la credencial/,
  );
});

test('ARCA_MODO=homologacion sin credencial → mismo error explícito', () => {
  assert.throws(
    () => crearAfipClient(config, { env: { ARCA_MODO: 'homologacion' } }),
    /no se pasó la credencial/,
  );
});

test('ARCA_MODO=real con credencial del CUIT correcto → adapter SOAP real', () => {
  const cred = credencialDeTest(CUIT);
  const client = crearAfipClient(config, { env: { ARCA_MODO: 'real' }, credencial: cred });
  assert.ok(client instanceof SoapAfipClient);
});

test('🔒 ADR-066: ARCA_MODO=real con cert de OTRO CUIT → aborta (guard fail-closed)', () => {
  const credOtroTenant = credencialDeTest(27999999993); // cert de otro contribuyente
  assert.throws(
    () => crearAfipClient(config, { env: { ARCA_MODO: 'real' }, credencial: credOtroTenant }),
    (err: unknown) => err instanceof CredencialCuitMismatchError,
  );
});

test('ARCA_MODO=homologacion con credencial de PRUEBA → SOAP real forzado a homologación (sin guard estricto)', () => {
  // Homologación es el sandbox oficial de test: se usa un cert de PRUEBA (otro CUIT) y el
  // endpoint se fuerza a homologación. El guard estricto de CUIT es solo para modo real.
  const prod: EmisorConfig = { cuit: CUIT, homologacion: false }; // Tenant en "producción"
  const credPrueba = credencialDeTest(27999999993);
  const client = crearAfipClient(prod, { env: { ARCA_MODO: 'homologacion' }, credencial: credPrueba });
  assert.ok(client instanceof SoapAfipClient);
});
