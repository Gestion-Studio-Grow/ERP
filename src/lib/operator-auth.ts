// Auth del PLANO DE OPERADOR (control-plane, ADR-021) — separado del auth de tenant.
//
// EDGE-SAFE A PROPÓSITO: lo importa `src/proxy.ts` (middleware, edge), así que usa
// SOLO Web Crypto. Es un plano de autorización DISTINTO al de tenant (ADR-021 §2.a-B):
// cookie propia (`operator_session`), secreto propio (`OPERATOR_SECRET`), y NADA que
// lo ate al `UserRole`/sesión de ningún tenant. El operador somos nosotros; la
// credencial es un secreto de entorno (patrón de bootstrap de ADR-017), no una fila
// de `User`.
//
// IDENTIDAD CON NOMBRE (2026-09-24). Antes había un único sujeto fijo ("operator") y todo quedaba
// como `operator:operator`: no se podía responder quién encendió algo en un negocio. Ahora:
//   · el dueño de GSG entra con OPERATOR_PASSWORD, como siempre, y su nombre es OPERADOR_DUENIO
//     (si no está, "duenio"). Producción no necesita ninguna variable nueva;
//   · OPERADORES (opcional) suma operadores con nombre: "nombre=pbkdf2$sal$hash;…", la línea que
//     arma /operador/clave en el navegador;
//   · el token es `op|<nombre>|<emitido en ms>` firmado, y vence a las 8 h EN EL SERVIDOR (antes el
//     vencimiento lo controlaba sólo el navegador con el maxAge de la cookie);
//   · un nombre que sale de OPERADORES pierde la sesión en el próximo pedido.
// Una sesión emitida con el formato anterior ("operator.<firma>") ya no vale: hay que volver a entrar.

import {
  claveCoincide,
  FORMATO_LINEA,
  igualesEnTiempoConstante,
  NOMBRE_OPERADOR_VALIDO as NOMBRE_VALIDO,
  normalizarNombreOperador,
} from "@/lib/operador/clave-operador";

export { normalizarNombreOperador };

const OPERATOR_COOKIE = "operator_session";

/** Cuánto vale una sesión de operador, verificado en el servidor con la fecha firmada. */
export const VIGENCIA_SESION_MS = 8 * 60 * 60 * 1000;
/** Tolerancia de reloj para un `emitido` apenas en el futuro. Más que esto, se rechaza. */
const TOLERANCIA_RELOJ_MS = 60 * 1000;

/** El nombre del dueño si OPERADOR_DUENIO no está (o no es un nombre válido). */
export const DUENIO_POR_DEFECTO = "duenio";

/** Forma exacta del payload firmado. Cualquier otra cosa (un id de usuario de un negocio) no es un operador. */
const PAYLOAD = /^op\|([a-z0-9][a-z0-9_-]{0,31})\|(\d{13})$/;

type Env = Record<string, string | undefined>;

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * El secreto del plano del operador.
 *
 * EL AGUJERO QUE ESTO CIERRA (2026-09-23). La sesión de un negocio es `userId.HMAC(AUTH_SECRET,
 * userId)` y la del operador era `payload.HMAC(OPERATOR_SECRET ?? AUTH_SECRET, payload)`, y la
 * verificación aceptaba CUALQUIER payload con firma válida. Con `OPERATOR_SECRET` sin cargar, o
 * cargado igual a `AUTH_SECRET`, alcanzaba con copiar la cookie de sesión de una recepcionista a
 * la cookie `operator_session` para abrir la consola que gobierna a los cuatro negocios.
 *
 * Tres cierres, cada uno suficiente por sí solo:
 *   1. En producción `OPERATOR_SECRET` es obligatoria y DISTINTA de `AUTH_SECRET`: nunca se cae al
 *      llavero del negocio (antes el fallback valía también en producción).
 *   2. La firma lleva un prefijo de dominio (`FIRMA_DOMINIO`): aunque los dos secretos fueran el
 *      mismo, una firma de sesión de negocio no sirve como firma del operador.
 *   3. `readOperatorToken` exige un payload de operador (`op|<nombre>|<emitido>`) con un nombre
 *      habilitado y dentro de las 8 h: un id de usuario de un negocio nunca tiene esa forma.
 */
function operatorSecret(): string {
  const propio = process.env.OPERATOR_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!propio) {
      throw new Error("OPERATOR_SECRET no está configurado. Es obligatorio en producción: el plano del operador es cross-tenant.");
    }
    if (propio === process.env.AUTH_SECRET) {
      throw new Error("OPERATOR_SECRET no puede ser igual a AUTH_SECRET: la sesión de un negocio abriría la consola de todos.");
    }
    return propio;
  }
  return propio ?? process.env.AUTH_SECRET ?? "dev-operator-secret";
}

/** Separación de dominio de la firma: una firma de sesión de negocio nunca coincide con esta. */
const FIRMA_DOMINIO = "gsg-operador-v1|";

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(operatorSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(FIRMA_DOMINIO + value));
  return toHex(signature);
}

export function getOperatorCookieName(): string {
  return OPERATOR_COOKIE;
}

// --- Quiénes son operadores -----------------------------------------------------

/** El nombre del operador dueño (OPERADOR_DUENIO normalizado, o "duenio"). */
export function operadorDuenio(env: Env = process.env): string {
  return normalizarNombreOperador(env.OPERADOR_DUENIO) ?? DUENIO_POR_DEFECTO;
}

/**
 * OPERADORES parseada: nombre → "pbkdf2$sal$hash". Separador ";" (o saltos de línea). Una entrada
 * mal formada se ignora entera: nunca habilita a nadie.
 */
export function operadoresConfigurados(env: Env = process.env): Map<string, string> {
  const out = new Map<string, string>();
  for (const entrada of (env.OPERADORES ?? "").split(/[;\n]/)) {
    const i = entrada.indexOf("=");
    if (i <= 0) continue;
    const nombre = normalizarNombreOperador(entrada.slice(0, i));
    const valor = entrada.slice(i + 1).trim();
    if (!nombre || !FORMATO_LINEA.test(valor)) continue;
    out.set(nombre, valor);
  }
  return out;
}

/** ¿Este nombre puede tener una sesión de operador hoy? El dueño siempre; el resto, si está en OPERADORES. */
export function operadorHabilitado(nombre: string, env: Env = process.env): boolean {
  return nombre === operadorDuenio(env) || operadoresConfigurados(env).has(nombre);
}

// --- Token de sesión --------------------------------------------------------------

/** Token firmado para `nombre`, emitido en `emitido` (ms). Por defecto, el dueño y ahora. */
export async function createOperatorToken(nombre: string = operadorDuenio(), emitido: number = Date.now()): Promise<string> {
  if (!NOMBRE_VALIDO.test(nombre) || !operadorHabilitado(nombre)) {
    throw new Error(`"${nombre}" no es un operador habilitado.`);
  }
  const payload = `op|${nombre}|${String(Math.floor(emitido)).padStart(13, "0")}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * Verifica la firma y devuelve el NOMBRE del operador, o null. NO toca DB (edge).
 * Rechaza: firma inválida, payload que no sea de operador (la cookie de un negocio), nombre que
 * ya no está habilitado, y sesiones de más de 8 h o emitidas en el futuro.
 */
export async function readOperatorToken(
  token: string | undefined | null,
  ahora: number = Date.now(),
): Promise<string | null> {
  if (!token) return null;
  const sep = token.lastIndexOf(".");
  if (sep <= 0) return null;
  const payload = token.slice(0, sep);
  const signature = token.slice(sep + 1);
  if (!payload || !signature) return null;
  // Sólo un payload de operador: un id de usuario de un negocio no es un operador aunque su
  // firma validara (ver operatorSecret).
  const m = PAYLOAD.exec(payload);
  if (!m) return null;
  const expected = await sign(payload);
  if (!igualesEnTiempoConstante(signature, expected)) return null;
  const emitido = Number(m[2]);
  if (!Number.isFinite(emitido) || emitido > ahora + TOLERANCIA_RELOJ_MS || ahora - emitido > VIGENCIA_SESION_MS) {
    return null;
  }
  const nombre = m[1];
  return operadorHabilitado(nombre) ? nombre : null;
}

// --- Credenciales -----------------------------------------------------------------

/** Un valor cualquiera para gastar el mismo tiempo cuando el nombre no existe. */
const VALOR_SENUELO = `pbkdf2$${"0".repeat(32)}$${"0".repeat(64)}`;

function passwordDelDuenio(env: Env): string | undefined {
  // En dev, sin OPERATOR_PASSWORD, "operador" para probar la consola local sin configurar nada.
  // Nunca en producción: ahí sin OPERATOR_PASSWORD el dueño sólo entra si está en OPERADORES.
  return env.OPERATOR_PASSWORD ?? (env.NODE_ENV !== "production" ? "operador" : undefined);
}

/**
 * ¿Nombre y clave son de un operador? Devuelve el nombre normalizado, o null.
 *   · nombre vacío = el dueño (el login de siempre, sólo con la clave);
 *   · si el nombre está en OPERADORES, se verifica contra su línea PBKDF2;
 *   · si no, y es el dueño, contra OPERATOR_PASSWORD.
 */
export async function verificarOperador(
  nombreTipeado: string,
  clave: string,
  env: Env = process.env,
): Promise<string | null> {
  const nombre = nombreTipeado.trim() === "" ? operadorDuenio(env) : normalizarNombreOperador(nombreTipeado);
  const linea = nombre ? operadoresConfigurados(env).get(nombre) : undefined;
  if (nombre && linea) return (await claveCoincide(clave, linea)) ? nombre : null;
  if (nombre && nombre === operadorDuenio(env)) {
    const esperada = passwordDelDuenio(env);
    return esperada !== undefined && igualesEnTiempoConstante(clave, esperada) ? nombre : null;
  }
  // Nombre desconocido: se gasta el mismo trabajo que una verificación real.
  await claveCoincide(clave, VALOR_SENUELO);
  return null;
}
