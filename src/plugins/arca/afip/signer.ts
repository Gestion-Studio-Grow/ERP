/**
 * ADAPTER de firma: implementa `TraSigner` firmando el TRA como CMS/PKCS#7
 * SignedData (base64), que es lo que WSAA espera para autenticar (ADR-022 §6).
 *
 * Node no trae CMS/PKCS#7 en `node:crypto` (solo firmas crudas), así que la
 * firma se hace con `node-forge` (pura JS, portable, sin openssl en runtime).
 * Equivale a `openssl cms -sign -nodetach -outform DER | base64`.
 *
 * El certificado y la clave privada del emisor entran por config (PEM); NUNCA
 * viven en el repo. Sin credenciales, seguí usando `CredencialRequeridaSigner`
 * (default del adapter). Con este signer inyectado, WSAA funciona: "encender,
 * no construir".
 */

import forge from 'node-forge';
import { TraSigner } from './soap';

/** Credencial del emisor (por tenant). Los PEM entran por secreto, no al repo. */
export interface CredencialEmisor {
  /** Certificado X.509 del emisor, en PEM. */
  certPem: string;
  /** Clave privada del emisor, en PEM. */
  keyPem: string;
}

/**
 * Firma el TRA como CMS/PKCS#7 SignedData (DER → base64), con el contenido
 * incluido (no detached) y digest SHA-256. Formato que autentica contra WSAA.
 */
export class Pkcs7TraSigner implements TraSigner {
  private readonly cert: forge.pki.Certificate;
  private readonly key: forge.pki.rsa.PrivateKey;

  constructor(cred: CredencialEmisor) {
    // Parseo eager: si el PEM está mal, falla acá (fail-fast en el arranque),
    // no en medio de una autorización.
    this.cert = forge.pki.certificateFromPem(cred.certPem);
    this.key = forge.pki.privateKeyFromPem(cred.keyPem) as forge.pki.rsa.PrivateKey;
  }

  async firmarCms(traXml: string): Promise<string> {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(traXml, 'utf8');
    p7.addCertificate(this.cert);
    p7.addSigner({
      key: this.key,
      certificate: this.cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        // messageDigest y signingTime los completa forge al firmar.
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: '' },
      ],
    });
    // detached:false → el TRA queda embebido en el CMS (lo que pide WSAA).
    p7.sign({ detached: false });

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
  }
}

/**
 * Lee la credencial del emisor desde variables de entorno. Devuelve `null` si
 * no están las dos (cert + clave) — para que el factory caiga al stub en vez de
 * romper. Los valores son acción humana (secretos por tenant/entorno).
 */
export function credencialDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): CredencialEmisor | null {
  const certPem = env.ARCA_CERT_PEM;
  const keyPem = env.ARCA_KEY_PEM;
  if (!certPem || !keyPem) return null;
  return { certPem, keyPem };
}
