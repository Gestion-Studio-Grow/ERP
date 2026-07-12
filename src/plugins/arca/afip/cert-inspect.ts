/**
 * Inspección del certificado X.509 del emisor: extrae el CUIT del subject y su
 * vencimiento. Base del GUARD FAIL-CLOSED (ADR-066): antes de firmar, el CUIT del
 * subject del cert cargado tiene que coincidir con `Tenant.arcaCuit` — si no, se aborta.
 *
 * En los certificados de ARCA/AFIP el CUIT del emisor va en el atributo `serialNumber`
 * del subject (OID 2.5.4.5), típicamente como "CUIT 20111111112" o "CUIT 20-11111111-2".
 * Extraemos los 11 dígitos de ese atributo; como red, caemos al CN. Usamos `node-forge`
 * (ya es dependencia del signer PKCS#7), sin openssl en runtime.
 *
 * Vive en el plugin (no en src/lib) para respetar la dirección de dependencias: src/lib
 * y el factory importan del plugin, no al revés.
 */

import forge from 'node-forge';

/** Deja solo dígitos (los CUIT pueden venir con guiones o el prefijo "CUIT "). */
function soloDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

/** Toma los primeros 11 dígitos si el texto contiene un CUIT (11 dígitos). */
function cuitDe(texto: string | undefined | null): string | null {
  if (!texto) return null;
  const m = soloDigitos(texto).match(/\d{11}/);
  return m ? m[0] : null;
}

/**
 * CUIT del subject del certificado (o `null` si no se puede determinar). Lee primero el
 * `serialNumber` del subject (donde ARCA pone el CUIT), luego el CN como fallback.
 * NO loguea el certificado.
 */
export function cuitDesdeCertPem(certPem: string): string | null {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    return null;
  }
  const subject = cert.subject;
  const serial = subject.getField({ name: 'serialNumber' }) ?? subject.getField('2.5.4.5');
  const desdeSerial = cuitDe(serial?.value);
  if (desdeSerial) return desdeSerial;
  const cn = subject.getField('CN');
  return cuitDe(cn?.value);
}

/** Vencimiento (`notAfter`) del certificado, o `null` si el PEM no parsea. */
export function vencimientoDesdeCertPem(certPem: string): Date | null {
  try {
    return forge.pki.certificateFromPem(certPem).validity.notAfter;
  } catch {
    return null;
  }
}

/** Error de aislamiento fiscal: el cert cargado no es del CUIT del tenant. */
export class CredencialCuitMismatchError extends Error {
  constructor(
    readonly esperado: string,
    readonly enCert: string | null,
  ) {
    super(
      `El certificado no corresponde al CUIT del tenant (esperado ${esperado}, ` +
        `el cert es de ${enCert ?? 'CUIT desconocido'}). Se aborta: nunca se firma con ` +
        `el certificado de otro contribuyente (ADR-066).`,
    );
    this.name = 'CredencialCuitMismatchError';
  }
}

/**
 * GUARD FAIL-CLOSED: exige que el CUIT del subject del cert coincida con `cuitTenant`.
 * Lanza `CredencialCuitMismatchError` si no coincide o si el cert no declara CUIT
 * legible. Es la última red antes de construir el firmante — corre siempre, no importa
 * de dónde vino el certificado.
 */
export function assertCertCoincideConCuit(certPem: string, cuitTenant: string): void {
  const enCert = cuitDesdeCertPem(certPem);
  if (!enCert || soloDigitos(cuitTenant) !== enCert) {
    throw new CredencialCuitMismatchError(soloDigitos(cuitTenant), enCert);
  }
}
