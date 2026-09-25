// ============================================================================
// SECRETOS DE INTEGRACIONES — sobre cifrado por conexión y campo (E3 §2.3).
// ============================================================================
//
// Mismo esquema que el material fiscal (ADR-066, src/lib/fiscal/cert-crypto.ts): cada secreto
// se cifra con su propia DEK aleatoria (AES-256-GCM) y la DEK se guarda envuelta por la KEK.
// Tres diferencias, a propósito:
//
//   1. KEK PROPIA: `INTEGRACIONES_MASTER_KEY`, nunca `FISCAL_MASTER_KEY`. Si se filtra una,
//      no abre lo de la otra. No hay caída a la fiscal y, si alguien pega el mismo valor en
//      las dos, esto no arranca.
//   2. AAD POR FILA: "tenantId|conexionId|campo" (con prefijo de dominio y versión). Un sobre
//      copiado a la fila de otra conexión, de otro negocio o de otro campo NO abre: GCM falla
//      la autenticación. El AAD no se guarda: se recalcula desde la fila que se está leyendo.
//      La DEK envuelta lleva el mismo AAD (con otro uso), así que tampoco se puede trasplantar
//      sólo la DEK.
//   3. TAG DE 16 BYTES OBLIGATORIO: Node acepta tags GCM más cortos si no se le dice el largo;
//      acá se fija `authTagLength: 16` y se chequea antes.
//
// Formato de cada parte cifrada: "gi1.<iv b64>.<tag b64>.<ct b64>". El sobre persiste en
// IntegracionCredencial (kekId, wrappedDek, sealed; E3 §5).
//
// Nada de acá loguea, y los mensajes de error nunca incluyen el secreto, la DEK ni la KEK.
// Sólo servidor (node:crypto). Unidad pura: sin DB, sin red.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const BYTES_IV = 12;
const BYTES_TAG = 16;
const BYTES_CLAVE = 32;
const VERSION = "gi1";
const DOMINIO_AAD = "gsg-integraciones";

export const VARIABLE_CLAVE_MAESTRA = "INTEGRACIONES_MASTER_KEY";
export const VARIABLE_ID_CLAVE_MAESTRA = "INTEGRACIONES_MASTER_KEY_ID";
export const ID_CLAVE_MAESTRA_POR_DEFECTO = "env:INTEGRACIONES_MASTER_KEY:v1";

/** La KEK resuelta. `id` se guarda en `kekId` para saber con cuál abrir (rotación). */
export interface ClaveMaestra {
  readonly clave: Buffer;
  readonly id: string;
}

/** A qué fila pertenece el secreto. Es el AAD del sobre. */
export interface ContextoSecreto {
  readonly tenantId: string;
  readonly conexionId: string;
  /** "access_token", "refresh_token", "webhook_secret", "ck", "cs", "archivo:<id>"… */
  readonly campo: string;
}

/** El sobre listo para guardar. Nada legible sin la KEK y sin el contexto correcto. */
export interface SobreSecreto {
  kekId: string;
  wrappedDek: string;
  sealed: string;
}

/** El sobre no abre: alterado, copiado de otra fila, o cerrado con otra KEK. */
export class SobreInvalidoError extends Error {
  readonly codigo = "credencial_ilegible" as const;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "SobreInvalidoError";
  }
}

/** Falta la KEK o está mal. Fail-closed: sin KEK válida no se cifra ni se abre nada. */
export class ClaveMaestraError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ClaveMaestraError";
  }
}

// ── La KEK ───────────────────────────────────────────────────────────────────

const RE_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const RE_ID_CLAVE = /^[A-Za-z0-9_.:-]{1,64}$/;

function decodificarClave(raw: string): Buffer | null {
  if (!RE_BASE64.test(raw) || raw.length % 4 !== 0) return null;
  const b = Buffer.from(raw, "base64");
  return b.length === BYTES_CLAVE ? b : null;
}

/**
 * Lee la KEK de `INTEGRACIONES_MASTER_KEY` (base64 de 32 bytes) EN CADA LLAMADA (runtime, no
 * build). Lanza si falta, si no mide 32 bytes o si es la misma que `FISCAL_MASTER_KEY`.
 * Generar una: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function claveMaestraDesdeEntorno(
  env: Record<string, string | undefined> = process.env,
): ClaveMaestra {
  const raw = env[VARIABLE_CLAVE_MAESTRA]?.trim();
  if (!raw) {
    throw new ClaveMaestraError(
      `Falta ${VARIABLE_CLAVE_MAESTRA} en el entorno de ejecución. Es la llave maestra de las ` +
        "credenciales de integraciones, separada de la fiscal: no se usa FISCAL_MASTER_KEY en su " +
        "lugar. Sin ella no se guarda ni se lee ninguna credencial de integraciones.",
    );
  }
  const clave = decodificarClave(raw);
  if (!clave) {
    throw new ClaveMaestraError(
      `${VARIABLE_CLAVE_MAESTRA} tiene que ser base64 estándar de ${BYTES_CLAVE} bytes (AES-256).`,
    );
  }
  const fiscalRaw = env.FISCAL_MASTER_KEY?.trim();
  const fiscal = fiscalRaw ? Buffer.from(fiscalRaw, "base64") : null;
  if (fiscal && fiscal.length === clave.length && timingSafeEqual(fiscal, clave)) {
    throw new ClaveMaestraError(
      `${VARIABLE_CLAVE_MAESTRA} es igual a FISCAL_MASTER_KEY. Tienen que ser distintas: si se ` +
        "filtra una, no puede abrir lo de la otra.",
    );
  }
  const id = env[VARIABLE_ID_CLAVE_MAESTRA]?.trim() || ID_CLAVE_MAESTRA_POR_DEFECTO;
  if (!RE_ID_CLAVE.test(id)) {
    throw new ClaveMaestraError(`${VARIABLE_ID_CLAVE_MAESTRA} inválido (letras, números y _.:- hasta 64).`);
  }
  return { clave, id };
}

function exigirClave(k: ClaveMaestra): void {
  if (!k || !Buffer.isBuffer(k.clave) || k.clave.length !== BYTES_CLAVE || !RE_ID_CLAVE.test(k.id ?? "")) {
    throw new ClaveMaestraError("Llave maestra inválida (se esperan 32 bytes y un id).");
  }
}

// ── AAD ──────────────────────────────────────────────────────────────────────

/** Sin "|": así "a|b" + "c" nunca puede dar el mismo AAD que "a" + "b|c". */
const RE_COMPONENTE = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * El AAD de un uso ("dek" o "dato") para una fila: "gsg-integraciones/gi1/<uso>|tenantId|
 * conexionId|campo". Lanza si algún componente está vacío o trae caracteres fuera de la lista
 * (un error de programación, no de datos).
 */
export function aadDe(ctx: ContextoSecreto, uso: "dek" | "dato"): Buffer {
  const partes: Array<[string, unknown]> = [
    ["tenantId", ctx?.tenantId],
    ["conexionId", ctx?.conexionId],
    ["campo", ctx?.campo],
  ];
  for (const [nombre, valor] of partes) {
    if (typeof valor !== "string" || !RE_COMPONENTE.test(valor)) {
      throw new Error(`Contexto del sobre inválido: ${nombre} vacío o con caracteres no permitidos.`);
    }
  }
  return Buffer.from(`${DOMINIO_AAD}/${VERSION}/${uso}|${ctx.tenantId}|${ctx.conexionId}|${ctx.campo}`, "utf8");
}

// ── Primitivas ───────────────────────────────────────────────────────────────

function cifrar(clave: Buffer, datos: Uint8Array, aad: Buffer): string {
  const iv = randomBytes(BYTES_IV);
  const c = createCipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_TAG });
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(datos), c.final()]);
  const tag = c.getAuthTag();
  return `${VERSION}.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

function parteBase64(s: string, puedeEstarVacia: boolean): Buffer | null {
  if (s === "") return puedeEstarVacia ? Buffer.alloc(0) : null;
  if (!RE_BASE64.test(s) || s.length % 4 !== 0) return null;
  return Buffer.from(s, "base64");
}

/** Descifra una parte. Cualquier falla (forma, largo del tag, autenticación) lanza. */
function descifrar(clave: Buffer, empaquetado: string, aad: Buffer): Buffer {
  const partes = empaquetado.split(".");
  if (partes.length !== 4 || partes[0] !== VERSION) throw new Error("forma");
  const iv = parteBase64(partes[1], false);
  const tag = parteBase64(partes[2], false);
  const ct = parteBase64(partes[3], true);
  if (!iv || iv.length !== BYTES_IV || !tag || tag.length !== BYTES_TAG || !ct) throw new Error("forma");
  const d = createDecipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_TAG });
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

function esSobre(x: unknown): x is SobreSecreto {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s.kekId === "string" && typeof s.wrappedDek === "string" && typeof s.sealed === "string";
}

// ── API ──────────────────────────────────────────────────────────────────────

/** Cierra bytes (un archivo, un secreto binario) para la fila `ctx`. */
export function cerrarBytes(datos: Uint8Array, ctx: ContextoSecreto, clave: ClaveMaestra): SobreSecreto {
  exigirClave(clave);
  if (!(datos instanceof Uint8Array)) throw new TypeError("Se esperaban bytes.");
  const aadDato = aadDe(ctx, "dato");
  const aadDek = aadDe(ctx, "dek");
  const dek = randomBytes(BYTES_CLAVE);
  try {
    const sealed = cifrar(dek, datos, aadDato);
    const wrappedDek = cifrar(clave.clave, dek, aadDek);
    return { kekId: clave.id, wrappedDek, sealed };
  } finally {
    dek.fill(0);
  }
}

/** Abre un sobre de la fila `ctx`. Lanza `SobreInvalidoError` ante cualquier duda. */
export function abrirBytes(sobre: SobreSecreto, ctx: ContextoSecreto, clave: ClaveMaestra): Buffer {
  exigirClave(clave);
  if (!esSobre(sobre)) throw new SobreInvalidoError("El sobre no tiene la forma esperada.");
  if (sobre.kekId !== clave.id) {
    throw new SobreInvalidoError(
      `El sobre se cerró con otra llave maestra (${sobre.kekId.slice(0, 64)}); hay que reenvolverlo con la vigente.`,
    );
  }
  const aadDato = aadDe(ctx, "dato");
  const aadDek = aadDe(ctx, "dek");
  let dek: Buffer | null = null;
  try {
    dek = descifrar(clave.clave, sobre.wrappedDek, aadDek);
    if (dek.length !== BYTES_CLAVE) throw new Error("forma");
    return descifrar(dek, sobre.sealed, aadDato);
  } catch {
    throw new SobreInvalidoError(
      "El sobre no abre: fue alterado o pertenece a otra conexión, a otro negocio o a otro campo.",
    );
  } finally {
    dek?.fill(0);
  }
}

/** Cierra un secreto de texto (UTF-8). Un secreto vacío no se guarda. */
export function cerrarSecreto(texto: string, ctx: ContextoSecreto, clave: ClaveMaestra): SobreSecreto {
  if (typeof texto !== "string" || texto.length === 0) throw new TypeError("No se guarda un secreto vacío.");
  const datos = Buffer.from(texto, "utf8");
  try {
    return cerrarBytes(datos, ctx, clave);
  } finally {
    datos.fill(0);
  }
}

/** Abre un secreto de texto. Lanza `SobreInvalidoError` si no abre. */
export function abrirSecreto(sobre: SobreSecreto, ctx: ContextoSecreto, clave: ClaveMaestra): string {
  const datos = abrirBytes(sobre, ctx, clave);
  try {
    return datos.toString("utf8");
  } finally {
    datos.fill(0);
  }
}

/**
 * Rotación de la KEK: re-envuelve la DEK con la llave nueva sin tocar el dato cifrado. Antes
 * comprueba que el sobre abre entero con la vieja (no se re-envuelve basura).
 */
export function reenvolver(
  sobre: SobreSecreto,
  ctx: ContextoSecreto,
  vieja: ClaveMaestra,
  nueva: ClaveMaestra,
): SobreSecreto {
  exigirClave(vieja);
  exigirClave(nueva);
  if (vieja.id === nueva.id) throw new ClaveMaestraError("La llave nueva tiene que tener otro id.");
  abrirBytes(sobre, ctx, vieja).fill(0);
  const aadDek = aadDe(ctx, "dek");
  let dek: Buffer | null = null;
  try {
    dek = descifrar(vieja.clave, sobre.wrappedDek, aadDek);
    return { kekId: nueva.id, wrappedDek: cifrar(nueva.clave, dek, aadDek), sealed: sobre.sealed };
  } finally {
    dek?.fill(0);
  }
}

/**
 * Los últimos 4 caracteres para mostrar "••••1234" (se guardan aparte, en claro). Si el secreto
 * es corto (menos de 12), null: 4 de 8 caracteres es regalar la mitad.
 */
export function ultimos4(secreto: string): string | null {
  const s = typeof secreto === "string" ? secreto.trim() : "";
  return s.length >= 12 ? s.slice(-4) : null;
}
