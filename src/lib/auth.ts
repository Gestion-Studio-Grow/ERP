// Firma y verificación del token de sesión del panel (ADR-017 §2.c).
//
// EDGE-SAFE A PROPÓSITO: este módulo lo importa `src/proxy.ts` (middleware, corre
// en edge), así que usa SOLO Web Crypto (crypto.subtle) — nada de node:crypto ni
// Prisma. El hashing de contraseñas (node:crypto scrypt) vive en `auth-password.ts` y la
// carga del usuario desde la base (Prisma) en `session.ts` — ninguno de los dos
// entra al bundle edge por esta vía.
//
// VENCIMIENTO EN EL SERVIDOR (seguridad, 08/11/2026 · ENG-013 en parte). Antes el token era
// `userId.HMAC(userId)`: sin fecha. Las 8 h eran sólo la vida de la cookie en el navegador; una
// cookie copiada (otra compu, una extensión, un respaldo del navegador) abría caja, ventas y
// facturación PARA SIEMPRE (medido en la operación real de CH, paso 15: a las 23:30 seguía
// entrando). Ahora el token es
//     v2|<userId>|<emitido ms>|<vence ms>.HMAC("gsg-sesion-v2|" + payload)
// y el servidor (proxy y `getCurrentUser`) lo rechaza pasado `vence`, o si `vence` se aleja de
// `emitido` más que VIGENCIA_SESION_MS, o si `emitido` está en el futuro. La firma lleva un prefijo
// de dominio: ninguna firma del formato viejo sirve para el nuevo, ni al revés.
//
// TRANSICIÓN (sin dejar afuera a nadie de golpe): un token del formato viejo se sigue aceptando
// hasta `finDeLaTransicion()` = el momento del build de producción + 9 h (la cookie vieja vence sola
// en el navegador a las 8 h de su ingreso, y desde el deploy ya no se emiten), con un tope fijo
// (`TOPE_DE_LA_TRANSICION`). Quien está trabajando al publicar sigue hasta que su cookie vence
// como siempre; después, todos entran con el formato nuevo. Pasado ese momento, un token viejo
// (vigente o copiado) no abre nada. Sin la marca de build (desarrollo, tests) no hay transición:
// el formato viejo se rechaza (falla cerrado). Detalle: docs/seguridad/sesion-con-vencimiento.md.
// Pendiente (no en este cambio): revocar al cerrar sesión o al cambiar la contraseña, que pide una
// columna en User (Gate 2).

const COOKIE_NAME = "admin_session";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// FAIL-CLOSED (A-1). El fallback `?? "dev-secret"` firmaba las cookies de sesión con
// un string PÚBLICO si `AUTH_SECRET` faltaba en producción: cualquiera que leyera el
// código podía forjar una cookie válida — bypass total de autenticación, silencioso.
// En producción ahora se rompe al arrancar, que es la falla correcta: un deploy sin
// secreto no debe atender, no debe atender inseguro. En desarrollo se mantiene el
// default para no romper el arranque local.
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET no está configurado. Es obligatorio en producción: sin él las sesiones se firmarían con una clave pública.",
    );
  }
  return "dev-secret";
}

async function sign(value: string) {
  const secret = authSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(signature);
}

function timingSafeStringEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

/** Cuánto vale una sesión del panel, verificado en el servidor con las fechas firmadas. */
export const VIGENCIA_SESION_MS = 8 * 60 * 60 * 1000;
/** Tolerancia de reloj para un `emitido` apenas en el futuro (servidores con relojes distintos). */
const TOLERANCIA_RELOJ_MS = 60 * 1000;
/** Separación de dominio de la firma del formato con vencimiento. */
const FIRMA_V2 = "gsg-sesion-v2|";
/** Ids de usuario que se firman: los de Prisma (cuid) y los de prueba. Nunca `|` ni `.`. */
const USER_ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
const PAYLOAD_V2 = /^v2\|([A-Za-z0-9_-]{1,64})\|(\d{13})\|(\d{13})$/;
/** Margen sobre la vida de la cookie vieja (8 h) para la transición después del build. */
const MARGEN_TRANSICION_MS = 9 * 60 * 60 * 1000;
/** Tope fijo de la transición: pasada esta fecha ningún token viejo vale, se haya publicado cuando se haya publicado. */
export const TOPE_DE_LA_TRANSICION = Date.UTC(2026, 11, 15, 9, 0, 0); // 15/12/2026 06:00 (Argentina)

/**
 * Hasta cuándo se acepta el formato viejo (`userId.firma`), en ms. Es la marca del build
 * (`GSG_COMPILADO_EN`, la inlinea next.config.ts) + 9 h, nunca después del tope. Sin la marca
 * (desarrollo, tests): 0, o sea, el formato viejo no vale.
 */
export function finDeLaTransicion(compiladoEn: string | undefined = process.env.GSG_COMPILADO_EN): number {
  // `process.env.GSG_COMPILADO_EN` escrito así, literal: es lo que Next reemplaza al compilar (también en edge).
  const compilado = Number(compiladoEn);
  if (!Number.isFinite(compilado) || compilado <= 0) return 0;
  return Math.min(compilado + MARGEN_TRANSICION_MS, TOPE_DE_LA_TRANSICION);
}

export async function createSessionToken(userId: string, emitido: number = Date.now()): Promise<string> {
  if (!USER_ID_VALIDO.test(userId)) throw new Error("Id de usuario inválido para la sesión.");
  const desde = Math.floor(emitido);
  const payload = `v2|${userId}|${String(desde).padStart(13, "0")}|${String(desde + VIGENCIA_SESION_MS).padStart(13, "0")}`;
  return `${payload}.${await sign(FIRMA_V2 + payload)}`;
}

export type OpcionesDeLectura = {
  /** El reloj (ms). Por defecto, ahora. */
  ahora?: number;
  /** Hasta cuándo vale el formato viejo (ms). Por defecto, `finDeLaTransicion()`. */
  legadoHasta?: number;
};

// Verifica la firma y la vigencia del token y devuelve el `userId` firmado, o null si el token
// falta / está mal formado / la firma no valida / venció. NO carga el usuario de la base
// (eso es `getCurrentUser()` en session.ts, runtime Node): esto es el portón
// grueso que puede correr en edge, y la misma verificación que usa session.ts.
export async function readSessionToken(
  token: string | undefined | null,
  opciones: OpcionesDeLectura = {},
): Promise<string | null> {
  if (!token) return null;
  const sepIndex = token.lastIndexOf(".");
  if (sepIndex <= 0) return null;
  const payload = token.slice(0, sepIndex);
  const signature = token.slice(sepIndex + 1);
  if (!payload || !signature) return null;
  const ahora = opciones.ahora ?? Date.now();

  if (payload.startsWith("v2|")) {
    const m = PAYLOAD_V2.exec(payload);
    if (!m) return null;
    if (!timingSafeStringEqual(signature, await sign(FIRMA_V2 + payload))) return null;
    const emitido = Number(m[2]);
    const vence = Number(m[3]);
    if (emitido > ahora + TOLERANCIA_RELOJ_MS) return null;
    if (vence <= emitido || vence - emitido > VIGENCIA_SESION_MS) return null;
    if (ahora >= vence) return null;
    return m[1];
  }

  // Formato viejo (`userId.firma`, sin fecha): sólo durante la transición, y sólo con forma de id.
  const legadoHasta = opciones.legadoHasta ?? finDeLaTransicion();
  if (ahora >= legadoHasta) return null;
  if (!USER_ID_VALIDO.test(payload)) return null;
  if (!timingSafeStringEqual(signature, await sign(payload))) return null;
  return payload;
}
