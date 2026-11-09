// Firma y verificación del token de sesión del panel (ADR-017 §2.c).
//
// EDGE-SAFE A PROPÓSITO: este módulo lo importa `src/proxy.ts` (middleware, corre
// en edge), así que usa SOLO Web Crypto (crypto.subtle) — nada de node:crypto ni
// Prisma. El hashing de contraseñas (node:crypto scrypt) vive en `auth-password.ts` y la
// carga del usuario desde la base (Prisma) en `session.ts` — ninguno de los dos
// entra al bundle edge por esta vía.
//
// VENCIMIENTO EN EL SERVIDOR (seguridad, 08/11/2026 · ENG-013 en parte). Antes el token era
// `userId.HMAC(userId)`: sin fecha. Una cookie copiada (otra compu, una extensión, un respaldo del navegador) abría
// caja, ventas y facturación PARA SIEMPRE (medido en la operación real de CH, paso 15). Ahora el token es
//     v3|<userId>|<ingreso ms>|<actividad ms>.HMAC("gsg-sesion-v3|" + payload)
// y el servidor (proxy y `getCurrentUser`) decide con la ÚLTIMA ACTIVIDAD firmada: la cuenta no vence nunca, pero
// con 15 min sin uso pide el PIN y con 7 días pide la contraseña (ver «VIGENCIA POR USO» más abajo). La firma lleva
// un prefijo de dominio: ninguna firma del formato viejo sirve para el nuevo, ni al revés.
//
// SIN TRANSICIÓN GENERAL (orden del dueño, 08/11/2026: «solamente el de Macarena Arias se mantiene, los demás
// no»). Desde que se publica, `readSessionToken` NO acepta el formato viejo de nadie. La única excepción no vive
// acá: el proxy manda un token viejo con firma válida a /admin/login/renovar, que carga el usuario de la base y
// sólo si está en la lista de `sesion-legado.ts` (tenant beauty-spa) le cambia la cookie por una v3. El token viejo
// nunca abre una pantalla ni una acción por sí mismo. Detalle: docs/seguridad/sesion-con-vencimiento.md.
// Pendiente (no en este cambio): revocar al cerrar sesión o al cambiar la contraseña, que pide una
// columna en User (Gate 2).

import { INACTIVIDAD_BLOQUEO_MS, INACTIVIDAD_VENCE_MS, RENOVAR_SESION_CADA_MS } from "@/lib/sesion-constantes";

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

// ── VIGENCIA POR USO (orden del dueño, 08/11/2026, textual: «El usuario no se va a vencer ni nada. A lo sumo
// diseñaríamos un ingreso por PIN cuando el usuario ya está logueado, para reactivarlo») ──────────────────────────
// La cuenta no vence nunca. El token lleva la ÚLTIMA ACTIVIDAD firmada y el proxy lo reemite con el uso (como mucho
// cada RENOVAR_SESION_CADA_MS). Según el tiempo sin uso:
//   · menos de INACTIVIDAD_BLOQUEO_MS → activa (abre pantallas y acciones);
//   · desde ahí y hasta INACTIVIDAD_VENCE_MS → bloqueada: NO abre nada; se destraba con el PIN del usuario
//     (/admin/login/desbloquear, sesion-pin.ts) o con la contraseña;
//   · desde INACTIVIDAD_VENCE_MS → vencida: contraseña completa.

export { INACTIVIDAD_BLOQUEO_MS, INACTIVIDAD_VENCE_MS, RENOVAR_SESION_CADA_MS };
/** Vida de la cookie en el navegador: lo mismo que la sesión bloqueada (después no sirve para nada). */
export const VIDA_COOKIE_SESION_S = INACTIVIDAD_VENCE_MS / 1000;
/** Tolerancia de reloj para una fecha apenas en el futuro (servidores con relojes distintos). */
const TOLERANCIA_RELOJ_MS = 60 * 1000;
/** Separación de dominio de la firma: ninguna firma del formato viejo ni del v2 sirve para este. */
const FIRMA_V3 = "gsg-sesion-v3|";
/** Ids de usuario que se firman: los de Prisma (cuid) y los de prueba. Nunca `|` ni `.`. */
const USER_ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
const PAYLOAD_V3 = /^v3\|([A-Za-z0-9_-]{1,64})\|(\d{13})\|(\d{13})$/;
const trece = (ms: number) => String(ms).padStart(13, "0");

/**
 * Token de sesión `v3|<userId>|<ingreso ms>|<actividad ms>.HMAC("gsg-sesion-v3|" + payload)`.
 * `actividad`: la última vez que se usó (por defecto, ahora). `ingreso`: cuándo se comprobó la CONTRASEÑA (o Google,
 * o clave y código) por última vez; 0 = en esta sesión nunca (el canje del token viejo). El PIN no lo cambia: sólo
 * con un `ingreso` reciente se puede definir o cambiar el PIN (sesion-pin.ts).
 */
export async function createSessionToken(
  userId: string,
  actividad: number = Date.now(),
  ingreso: number = actividad,
): Promise<string> {
  if (!USER_ID_VALIDO.test(userId)) throw new Error("Id de usuario inválido para la sesión.");
  const act = Math.floor(actividad);
  const ing = Math.floor(ingreso);
  if (!Number.isFinite(act) || !Number.isFinite(ing) || ing < 0 || act < 0 || ing > act) {
    throw new Error("Fechas inválidas para la sesión.");
  }
  const payload = `v3|${userId}|${trece(ing)}|${trece(act)}`;
  return `${payload}.${await sign(FIRMA_V3 + payload)}`;
}

export type OpcionesDeLectura = {
  /** El reloj (ms). Por defecto, ahora. */
  ahora?: number;
};

export type EstadoDeSesion = "activa" | "bloqueada" | "vencida";
export type SesionLeida = { estado: EstadoDeSesion; userId: string; ingreso: number; actividad: number };

/**
 * Lee el token con su firma y dice en qué estado está, o null si falta / está mal formado / la firma no valida /
 * las fechas no cierran. NO carga el usuario de la base. Edge-safe: lo usa el proxy.
 */
export async function leerSesion(
  token: string | undefined | null,
  opciones: OpcionesDeLectura = {},
): Promise<SesionLeida | null> {
  if (!token) return null;
  const sepIndex = token.lastIndexOf(".");
  if (sepIndex <= 0) return null;
  const payload = token.slice(0, sepIndex);
  const signature = token.slice(sepIndex + 1);
  if (!payload || !signature) return null;
  const m = PAYLOAD_V3.exec(payload);
  if (!m) return null; // formato viejo y v2 (nunca publicado): no abren nada. Ver `idDelTokenLegadoParaCanje`.
  if (!timingSafeStringEqual(signature, await sign(FIRMA_V3 + payload))) return null;
  const ahora = opciones.ahora ?? Date.now();
  // Falla cerrada: con `ahora` NaN o infinito ninguna comparación es confiable.
  if (!Number.isFinite(ahora)) return null;
  const ingreso = Number(m[2]);
  const actividad = Number(m[3]);
  if (ingreso > actividad) return null;
  if (actividad > ahora + TOLERANCIA_RELOJ_MS) return null;
  const sinUso = ahora - actividad;
  const estado: EstadoDeSesion =
    sinUso < INACTIVIDAD_BLOQUEO_MS ? "activa" : sinUso < INACTIVIDAD_VENCE_MS ? "bloqueada" : "vencida";
  return { estado, userId: m[1], ingreso, actividad };
}

// El `userId` firmado SÓLO si la sesión está activa (con uso en los últimos INACTIVIDAD_BLOQUEO_MS); si no, null.
// Es la verificación que usan el proxy y `getCurrentUser()` (session.ts): una sesión bloqueada no abre nada.
export async function readSessionToken(
  token: string | undefined | null,
  opciones: OpcionesDeLectura = {},
): Promise<string | null> {
  const s = await leerSesion(token, opciones);
  return s && s.estado === "activa" ? s.userId : null;
}

/**
 * El token de esta sesión pero BLOQUEADO: la actividad firmada pasa a «hace INACTIVIDAD_BLOQUEO_MS» (o queda la que
 * tenía, si era más vieja) y el ingreso no la supera. Lo usa /admin/login/bloquear cuando el navegador mide 15 min sin
 * uso REAL: los sondeos automáticos (chip de pedidos, bandeja) renuevan la cookie en el proxy y, sin esto, una PC
 * abandonada con el panel abierto no se bloqueaba nunca (certificación GSG-SEG-004). Vencida o inválida → null.
 */
export async function tokenBloqueadoDe(token: string | undefined | null, ahora: number = Date.now()): Promise<string | null> {
  const s = await leerSesion(token, { ahora });
  if (!s || s.estado === "vencida") return null;
  const actividad = Math.max(0, Math.min(s.actividad, ahora - INACTIVIDAD_BLOQUEO_MS));
  return createSessionToken(s.userId, actividad, Math.min(s.ingreso, actividad));
}

/** ¿Hay que reemitir el token de una sesión activa? (pasó RENOVAR_SESION_CADA_MS desde la última actividad firmada). */
export function sesionParaRenovar(s: SesionLeida | null, ahora: number = Date.now()): boolean {
  return !!s && s.estado === "activa" && ahora - s.actividad >= RENOVAR_SESION_CADA_MS;
}

/**
 * Si el token es del formato viejo (`userId.HMAC(userId)`, sin fecha) con firma válida, el `userId` firmado; si
 * no, null. NO AUTORIZA NADA: sólo lo usan el proxy (para mandar a canjear) y /admin/login/renovar, que decide
 * con el usuario cargado de la base (`canjearTokenLegado`, sesion-legado.ts). Edge-safe.
 */
export async function idDelTokenLegadoParaCanje(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const sepIndex = token.lastIndexOf(".");
  if (sepIndex <= 0) return null;
  const payload = token.slice(0, sepIndex);
  const signature = token.slice(sepIndex + 1);
  if (!signature || payload.startsWith("v2|") || payload.startsWith("v3|")) return null;
  if (!USER_ID_VALIDO.test(payload)) return null;
  if (!timingSafeStringEqual(signature, await sign(payload))) return null;
  return payload;
}
