/**
 * ENVELOPE ENCRYPTION del material fiscal por tenant (ADR-066).
 *
 * Cierra la violación de tener el certificado ARCA en un env único compartido: cada
 * credencial se cifra con su propia DEK (data key) aleatoria; la DEK se guarda ENVUELTA
 * por la KEK (master key), que vive SOLO en `FISCAL_MASTER_KEY` (env/secret store), nunca
 * en la DB ni en el repo. Así:
 *   - el material en reposo es ilegible sin la master key;
 *   - rotar la master key = re-envolver las DEK, sin re-cifrar el material;
 *   - comprometer una DEK no expone las demás credenciales.
 *
 * Cripto: AES-256-GCM (autenticado: detecta cualquier tampering) con IV aleatorio de 12
 * bytes por operación, vía `node:crypto` puro (sin dependencias). Formato serializado:
 * `base64(iv) . base64(tag) . base64(ciphertext)` (3 campos separados por punto).
 *
 * Este módulo NO toca la DB ni Next: es una unidad pura y testeable offline.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32; // AES-256
const DEFAULT_KEK_ID = "env:FISCAL_MASTER_KEY:v1";

/** La master key (KEK) resuelta + su id (para rotación). */
export interface MasterKey {
  /** 32 bytes de clave. */
  key: Buffer;
  /** Identificador/versión de esta KEK — se persiste en `kekId` para saber con cuál desenvolver. */
  id: string;
}

/** Sobre cerrado listo para persistir (nada legible sin la master key). */
export interface SealedCredential {
  /** id/versión de la KEK con la que se envolvió la DEK. */
  kekId: string;
  /** DEK envuelta por la KEK. */
  wrappedDek: string;
  /** Payload (los PEM) cifrado con la DEK. */
  sealed: string;
}

/** El material sensible en claro. Solo existe en memoria, nunca se persiste ni se loguea. */
export interface CredentialPlaintext {
  certPem: string;
  keyPem: string;
}

/**
 * Resuelve la master key desde `FISCAL_MASTER_KEY` (base64 de 32 bytes). Falla fuerte si
 * no está o no mide 32 bytes: preferimos NO poder cifrar/emitir antes que hacerlo con una
 * clave débil o ausente (fail-closed). Generá una con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function masterKeyDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): MasterKey {
  const raw = env.FISCAL_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "FISCAL_MASTER_KEY no está seteada. Es la master key (KEK) que cifra las credenciales " +
        "fiscales por tenant — acción humana (secreto de entorno). Sin ella no se puede cargar " +
        "ni usar ningún certificado ARCA. Generá 32 bytes base64 y seteala en el entorno.",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("FISCAL_MASTER_KEY debe ser base64 de 32 bytes.");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `FISCAL_MASTER_KEY debe decodificar a ${KEY_BYTES} bytes (AES-256); tiene ${key.length}.`,
    );
  }
  return { key, id: env.FISCAL_MASTER_KEY_ID ?? DEFAULT_KEK_ID };
}

// --- Primitivas AES-256-GCM (formato "iv.tag.ct" en base64) -------------------

function encryptWith(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

function decryptWith(key: Buffer, packed: string): Buffer {
  const parts = packed.split(".");
  if (parts.length !== 3) throw new Error("Formato cifrado inválido (se esperaba iv.tag.ct).");
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  // Si el material fue tampereado (o la clave es incorrecta), `final()` lanza. Fail-closed.
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// --- API de envelope ----------------------------------------------------------

/**
 * Cierra el material del emisor: genera una DEK aleatoria, cifra los PEM con la DEK, y
 * envuelve la DEK con la KEK (master). Devuelve el sobre listo para persistir. El
 * plaintext NO se retiene ni se loguea.
 */
export function sealCredential(
  plaintext: CredentialPlaintext,
  master: MasterKey,
): SealedCredential {
  const dek = randomBytes(KEY_BYTES);
  const payload = Buffer.from(JSON.stringify({ certPem: plaintext.certPem, keyPem: plaintext.keyPem }), "utf8");
  const sealed = encryptWith(dek, payload);
  const wrappedDek = encryptWith(master.key, dek);
  return { kekId: master.id, wrappedDek, sealed };
}

/**
 * Abre un sobre: desenvuelve la DEK con la KEK y descifra los PEM. Lanza si la master key
 * no corresponde o si el material fue alterado (GCM). Fail-closed: ante cualquier duda,
 * NO devuelve material.
 */
export function openCredential(
  sealed: SealedCredential,
  master: MasterKey,
): CredentialPlaintext {
  const dek = decryptWith(master.key, sealed.wrappedDek);
  const payload = decryptWith(dek, sealed.sealed);
  const parsed = JSON.parse(payload.toString("utf8")) as CredentialPlaintext;
  if (!parsed.certPem || !parsed.keyPem) {
    throw new Error("Sobre fiscal corrupto: faltan certPem/keyPem tras descifrar.");
  }
  return parsed;
}
