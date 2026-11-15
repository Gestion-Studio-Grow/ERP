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
 * Este módulo NO toca la DB ni Next: es una unidad pura y testeable offline (el único efecto es el
 * aviso de la etiqueta por defecto, inyectable).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32; // AES-256
/**
 * La etiqueta de la KEK cuando `FISCAL_MASTER_KEY_ID` no está seteada (o está en blanco). Es la que
 * llevan las filas cerradas antes de existir la variable: cambiarla las haría ver «de otra clave».
 * No es silenciosa: `masterKeyDesdeEnv` la marca (`idPorDefecto`) y avisa una vez por proceso.
 */
export const KEK_ID_POR_DEFECTO = "env:FISCAL_MASTER_KEY:v1";

export const AVISO_KEK_ID_POR_DEFECTO =
  "FISCAL_MASTER_KEY_ID no está seteada: se usa la etiqueta por defecto de la clave maestra. " +
  "Seteala en el entorno para poder rotar la clave sin confundir pedidos y certificados de cada clave.";

/** La master key (KEK) resuelta + su id (para rotación). */
export interface MasterKey {
  /** 32 bytes de clave. */
  key: Buffer;
  /** Identificador/versión de esta KEK — se persiste en `kekId` para saber con cuál desenvolver. */
  id: string;
  /** true = `id` es `KEK_ID_POR_DEFECTO` porque `FISCAL_MASTER_KEY_ID` falta o está en blanco. */
  idPorDefecto?: boolean;
}

let avisoPorDefectoDado = false;

/** El aviso de fábrica: una línea de log por proceso (sin valores: sólo el nombre de la variable). */
function avisarUnaVez(mensaje: string): void {
  if (avisoPorDefectoDado) return;
  avisoPorDefectoDado = true;
  logger.warn("fiscal.cert-crypto", mensaje);
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
 * Fingerprint del entorno de EJECUCIÓN — SOLO para diagnóstico, NUNCA expone ningún valor.
 * Reporta si el runtime ve otras variables (para distinguir "no llegó NADA del entorno" de
 * "esta variable puntual falta/está mal nombrada/mal targeteada en Vercel"). Los nombres de
 * infra (DATABASE_URL, etc.) y `VERCEL_ENV` (production|preview|development) no son secretos.
 */
function fingerprintEntornoRuntime(env: Record<string, string | undefined>): string {
  const presente = (k: string) => (env[k] != null && env[k] !== "" ? "sí" : "no");
  const total = Object.keys(env).length;
  const vercelEnv = env.VERCEL_ENV ?? (env.VERCEL ? "vercel(sin VERCEL_ENV)" : "no-vercel");
  // Boolean-only: ¿hay ALGUNA clave que contenga FISCAL/MASTER? (no imprime el nombre ni el valor)
  const hayVecina = Object.keys(env).some((k) => /FISCAL|MASTER/i.test(k)) ? "sí" : "no";
  return (
    `[diagnóstico runtime — sin exponer valores] entorno=${vercelEnv} · ` +
    `vars visibles=${total} · DATABASE_URL=${presente("DATABASE_URL")} · ` +
    `OPERATOR_DATABASE_URL=${presente("OPERATOR_DATABASE_URL")} · ` +
    `alguna clave FISCAL/MASTER=${hayVecina}`
  );
}

/**
 * Resuelve la master key desde `FISCAL_MASTER_KEY` (base64 de 32 bytes). Falla fuerte si
 * no está o no mide 32 bytes: preferimos NO poder cifrar/emitir antes que hacerlo con una
 * clave débil o ausente (fail-closed). Generá una con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * IMPORTANTE (runtime, no build): se lee `process.env` EN CADA LLAMADA (el default del
 * parámetro se evalúa al invocar, no al cargar el módulo). En Vercel esto corre en la
 * función Node (server action/route) donde las env vars — incluidas las "Sensitive" — están
 * disponibles en runtime. Nunca se lee en top-level de módulo (build) ni en Edge. Si aún así
 * falta, el error trae un fingerprint del entorno para diagnosticar desde el propio runtime.
 */
export function masterKeyDesdeEnv(
  env: Record<string, string | undefined> = process.env,
  opciones: { avisar?: (mensaje: string) => void } = {},
): MasterKey {
  // `.trim()`: robusto ante el pegado con newline/espacios finales (evita un decode a 33
  // bytes que confundiría "mal seteada" con "no seteada").
  const raw = env.FISCAL_MASTER_KEY?.trim();
  if (!raw) {
    throw new Error(
      "FISCAL_MASTER_KEY no está seteada en el entorno de EJECUCIÓN (runtime). Es la master " +
        "key (KEK) que cifra las credenciales fiscales por tenant — acción humana (secreto de " +
        "entorno). Sin ella no se puede cargar ni usar ningún certificado ARCA. Se lee en " +
        "runtime (servidor Node), NO en build ni en Edge: si el diagnóstico muestra otras vars " +
        "presentes (p.ej. DATABASE_URL=sí) pero esta ausente, la variable NO está inyectada en " +
        "ESTE deployment — revisá proyecto/entorno correcto en Vercel y volvé a desplegar. " +
        "Generá 32 bytes base64 y seteala en el entorno. " +
        fingerprintEntornoRuntime(env),
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
  // La etiqueta: recortada (pegado con newline) y, si falta o está en blanco, la de por defecto
  // MARCADA y avisada. Nunca una etiqueta vacía: `""` antes pasaba por `??` y quedaba persistida.
  const id = env.FISCAL_MASTER_KEY_ID?.trim();
  if (!id) {
    (opciones.avisar ?? avisarUnaVez)(AVISO_KEK_ID_POR_DEFECTO);
    return { key, id: KEK_ID_POR_DEFECTO, idPorDefecto: true };
  }
  return { key, id, idPorDefecto: false };
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
  // Si el material fue tampereado (o la clave es incorrecta), `final()` lanza. Fail-closed. Lo
  // descifrado a medias se pisa con ceros (sólo sale la copia de `concat`, y sólo si autenticó).
  const parcial = decipher.update(ct);
  try {
    return Buffer.concat([parcial, decipher.final()]);
  } finally {
    parcial.fill(0);
  }
}

// --- API de envelope ----------------------------------------------------------

/**
 * Envelope GENÉRICO: cierra un string arbitrario (UTF-8) con una DEK aleatoria y
 * envuelve la DEK con la KEK. Mismo esquema que `sealCredential`, para material
 * sensible que NO son los PEM del cert — p.ej. el TA de ARCA (token+sign), un
 * bearer de ~12h que igual conviene guardar cifrado (defensa en profundidad;
 * nunca en claro en la DB). El plaintext NO se retiene ni se loguea.
 */
export function sealSecret(plaintext: string, master: MasterKey): SealedCredential {
  const dek = randomBytes(KEY_BYTES);
  const sealed = encryptWith(dek, Buffer.from(plaintext, "utf8"));
  const wrappedDek = encryptWith(master.key, dek);
  return { kekId: master.id, wrappedDek, sealed };
}

/** Abre un sobre genérico creado por `sealSecret` → el string original. Fail-closed. */
export function openSecret(sealed: SealedCredential, master: MasterKey): string {
  const dek = decryptWith(master.key, sealed.wrappedDek);
  const payload = decryptWith(dek, sealed.sealed);
  return payload.toString("utf8");
}

/**
 * ¿Abre este sobre con esta KEK? Verifica las dos capas (GCM) sin devolver nada: lo descifrado se
 * pisa con ceros antes de salir. Para decidir sobre una fila (p. ej. si quedó cerrada con otra
 * clave maestra) sin que el material salga de acá. La etiqueta (`kekId`) no decide.
 */
export function elSobreAbre(sealed: SealedCredential, master: MasterKey): boolean {
  return comoAbreElSobre(sealed, master) === "abre";
}

/**
 * Qué capa del sobre abre con esta KEK, sin devolver nada (lo descifrado se pisa con ceros):
 *   - «abre»: las dos capas.
 *   - «no-abre-con-esta-clave»: la DEK no se desenvuelve. Es lo que da un sobre cerrado con OTRA KEK
 *     aunque la etiqueta (`kekId`) sea la misma (rotación sin cambiar `FISCAL_MASTER_KEY_ID`): puede
 *     volver a abrir restaurando esa clave. GCM no distingue esto de una DEK envuelta alterada, así que
 *     se trata como recuperable (no se pisa sin una decisión humana).
 *   - «contenido-dañado»: la DEK se desenvuelve (GCM: la KEK es esta y la DEK es auténtica) pero el
 *     contenido no descifra. Irrecuperable con cualquier clave.
 */
export type AperturaDelSobre = "abre" | "no-abre-con-esta-clave" | "contenido-dañado";

export function comoAbreElSobre(sealed: SealedCredential, master: MasterKey): AperturaDelSobre {
  let dek: Buffer | null = null;
  let payload: Buffer | null = null;
  try {
    try {
      dek = decryptWith(master.key, sealed.wrappedDek);
    } catch {
      return "no-abre-con-esta-clave";
    }
    try {
      payload = decryptWith(dek, sealed.sealed);
    } catch {
      return "contenido-dañado";
    }
    return "abre";
  } finally {
    dek?.fill(0);
    payload?.fill(0);
  }
}

/**
 * Cierra el material del emisor: genera una DEK aleatoria, cifra los PEM con la DEK, y
 * envuelve la DEK con la KEK (master). Devuelve el sobre listo para persistir. El
 * plaintext NO se retiene ni se loguea.
 */
export function sealCredential(
  plaintext: CredentialPlaintext,
  master: MasterKey,
): SealedCredential {
  return sealSecret(
    JSON.stringify({ certPem: plaintext.certPem, keyPem: plaintext.keyPem }),
    master,
  );
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
