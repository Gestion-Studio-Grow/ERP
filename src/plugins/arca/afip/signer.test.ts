import test from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { Pkcs7TraSigner, credencialDesdeEnv } from './signer';
import { armarLoginTicketRequest } from './soap';

// Genera un par de claves + cert self-signed de test (clave chica: es solo para
// firmar en el test, priorizamos velocidad sobre robustez cripto).
function credencialDeTest(cn = 'test-emisor') {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [
    { name: 'commonName', value: cn },
    { name: 'countryName', value: 'AR' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

test('firmarCms devuelve un CMS SignedData válido (base64) con el TRA embebido', async () => {
  const cred = credencialDeTest();
  const signer = new Pkcs7TraSigner(cred);
  const tra = armarLoginTicketRequest('wsfe', new Date(2026, 0, 1, 12, 0, 0));

  const b64 = await signer.firmarCms(tra);
  assert.ok(b64.length > 0, 'debe devolver base64 no vacío');

  // Se puede volver a parsear como CMS/PKCS#7 SignedData.
  const der = forge.util.decode64(b64);
  const asn1 = forge.asn1.fromDer(der);
  const msg = forge.pkcs7.messageFromAsn1(asn1) as unknown as {
    type: string;
    certificates: forge.pki.Certificate[];
  };
  assert.equal(msg.type, forge.pki.oids.signedData, 'debe ser signedData');

  // Lleva el certificado del emisor adentro (WSAA lo necesita para validar).
  assert.equal(msg.certificates.length, 1);
  assert.equal(msg.certificates[0].subject.getField('CN').value, 'test-emisor');
});

test('el CMS no es determinístico entre firmas (signingTime) pero siempre válido', async () => {
  const signer = new Pkcs7TraSigner(credencialDeTest());
  const tra = armarLoginTicketRequest('wsfe', new Date(2026, 0, 1, 12, 0, 0));
  const a = await signer.firmarCms(tra);
  const b = await signer.firmarCms(tra);
  // Cada firma es parseable (no exigimos igualdad: hay signingTime/nonce).
  for (const b64 of [a, b]) {
    const msg = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.decode64(b64)),
    ) as unknown as { type: string };
    assert.equal(msg.type, forge.pki.oids.signedData);
  }
});

test('constructor con PEM inválido falla fail-fast', () => {
  assert.throws(() => new Pkcs7TraSigner({ certPem: 'no-pem', keyPem: 'no-pem' }));
});

test('credencialDesdeEnv: null si falta cert o clave, credencial si están las dos', () => {
  assert.equal(credencialDesdeEnv({}), null);
  assert.equal(credencialDesdeEnv({ ARCA_CERT_PEM: 'x' }), null);
  assert.equal(credencialDesdeEnv({ ARCA_KEY_PEM: 'y' }), null);
  assert.deepEqual(credencialDesdeEnv({ ARCA_CERT_PEM: 'x', ARCA_KEY_PEM: 'y' }), {
    certPem: 'x',
    keyPem: 'y',
  });
});
