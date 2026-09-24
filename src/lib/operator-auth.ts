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
//   · el token es `op|<rol>|<nombre>|<emitido en ms>` firmado (rol "d" = dueño, "o" = OPERADORES), y
//     vence a las 8 h EN EL SERVIDOR (antes el vencimiento lo controlaba sólo el navegador);
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

/**
 * Forma exacta del payload firmado: `op|<rol>|<nombre>|<emitido>`. Cualquier otra cosa (un id de
 * usuario de un negocio, o un token de un formato anterior) no es un operador.
 * El ROL dice CÓMO se entró y va firmado: "d" = el dueño, con OPERATOR_PASSWORD; "o" = un operador de
 * OPERADORES, con su línea PBKDF2. Un token "o" nunca es dueño, aunque OPERADOR_DUENIO pase a tener
 * su nombre; un token "d" deja de valer si su nombre ya no es el del dueño.
 */
const PAYLOAD = /^op\|([do])\|([a-z0-9][a-z0-9_-]{0,31})\|(\d{13})$/;

/** Cómo entró el operador de esta sesión. */
export type RolOperador = "d" | "o";

export interface SesionOperador {
  nombre: string;
  rol: RolOperador;
  /** ¿Es el dueño de GSG? Sólo con rol "d" Y su nombre igual a OPERADOR_DUENIO hoy. */
  esDuenio: boolean;
}

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

/** Avisos de OPERADORES ya logueados, por valor de la variable: se parsea en cada pedido. */
const avisados = new Set<string>();

function avisarOperadores(clave: string, mensaje: string): void {
  if (avisados.has(clave)) return;
  avisados.add(clave);
  // Edge-safe: sin el logger del servidor. Nunca se imprime el hash, sólo el nombre.
  console.warn(JSON.stringify({ level: "warn", scope: "operator-auth", msg: mensaje }));
}

/**
 * OPERADORES parseada: nombre → "pbkdf2$sal$hash". Separador ";" (o saltos de línea). Se ignoran
 * enteras, y nunca habilitan a nadie:
 *   · una entrada mal formada;
 *   · una entrada con el nombre del DUEÑO (comparado normalizado): el dueño se autentica SÓLO con
 *     OPERATOR_PASSWORD. Si no, cualquiera que lograra sumar su línea como "duenio" quedaba como
 *     dueño, el único que puede tocar CH;
 *   · un nombre que aparece DOS veces: se rechazan las dos (ningún orden decide cuál vale).
 */
export function operadoresConfigurados(env: Env = process.env): Map<string, string> {
  const duenio = operadorDuenio(env);
  const vistos = new Map<string, string>();
  const repetidos = new Set<string>();
  for (const entrada of (env.OPERADORES ?? "").split(/[;\n]/)) {
    const i = entrada.indexOf("=");
    if (i <= 0) continue;
    const nombre = normalizarNombreOperador(entrada.slice(0, i));
    const valor = entrada.slice(i + 1).trim();
    if (!nombre || !FORMATO_LINEA.test(valor)) continue;
    if (nombre === duenio) {
      avisarOperadores(
        `duenio:${env.OPERADORES}`,
        `OPERADORES trae una línea con el nombre del dueño ("${nombre}"): se ignora. El dueño entra sólo con OPERATOR_PASSWORD.`,
      );
      continue;
    }
    if (vistos.has(nombre)) repetidos.add(nombre);
    vistos.set(nombre, valor);
  }
  for (const nombre of repetidos) {
    vistos.delete(nombre);
    avisarOperadores(
      `repetido:${nombre}:${env.OPERADORES}`,
      `OPERADORES trae a "${nombre}" más de una vez: se ignoran todas sus líneas hasta que quede una sola.`,
    );
  }
  return vistos;
}

/** ¿Este nombre puede tener una sesión de operador hoy? El dueño siempre; el resto, si está en OPERADORES. */
export function operadorHabilitado(nombre: string, env: Env = process.env): boolean {
  return nombre === operadorDuenio(env) || operadoresConfigurados(env).has(nombre);
}

/** ¿Una sesión con este rol y este nombre sigue valiendo hoy? */
function sesionVigente(rol: RolOperador, nombre: string, env: Env): boolean {
  return rol === "d" ? nombre === operadorDuenio(env) : operadoresConfigurados(env).has(nombre);
}

// --- Token de sesión --------------------------------------------------------------

/**
 * Token firmado para `nombre`, emitido en `emitido` (ms). Por defecto, el dueño y ahora. El rol sale
 * de CÓMO se autentica ese nombre hoy: el del dueño sólo entra con OPERATOR_PASSWORD ("d") y el de
 * cualquier otro sólo con su línea de OPERADORES ("o"); `operadoresConfigurados` nunca trae el
 * nombre del dueño, así que los dos caminos no se pisan.
 */
export async function createOperatorToken(nombre: string = operadorDuenio(), emitido: number = Date.now()): Promise<string> {
  const rol: RolOperador = nombre === operadorDuenio() ? "d" : "o";
  if (!NOMBRE_VALIDO.test(nombre) || !sesionVigente(rol, nombre, process.env)) {
    throw new Error(`"${nombre}" no es un operador habilitado.`);
  }
  const payload = `op|${rol}|${nombre}|${String(Math.floor(emitido)).padStart(13, "0")}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * Verifica la firma y devuelve la SESIÓN del operador (nombre, rol y si es el dueño), o null. NO toca
 * DB (edge). Rechaza: firma inválida, payload que no sea de operador (la cookie de un negocio o un
 * token de un formato anterior), una sesión que ya no vale para su rol (ver `sesionVigente`), y
 * sesiones de más de 8 h o emitidas en el futuro.
 */
export async function leerSesionOperador(
  token: string | undefined | null,
  ahora: number = Date.now(),
): Promise<SesionOperador | null> {
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
  const emitido = Number(m[3]);
  if (!Number.isFinite(emitido) || emitido > ahora + TOLERANCIA_RELOJ_MS || ahora - emitido > VIGENCIA_SESION_MS) {
    return null;
  }
  const rol = m[1] as RolOperador;
  const nombre = m[2];
  if (!sesionVigente(rol, nombre, process.env)) return null;
  return { nombre, rol, esDuenio: rol === "d" && nombre === operadorDuenio() };
}

/** El NOMBRE del operador del token, o null (lo que usa el portón del proxy). */
export async function readOperatorToken(
  token: string | undefined | null,
  ahora: number = Date.now(),
): Promise<string | null> {
  return (await leerSesionOperador(token, ahora))?.nombre ?? null;
}

// --- Credenciales -----------------------------------------------------------------

/** Un valor cualquiera para gastar el mismo tiempo cuando el nombre no existe. */
const VALOR_SENUELO = `pbkdf2$${"0".repeat(32)}$${"0".repeat(64)}`;

function passwordDelDuenio(env: Env): string | undefined {
  // En desarrollo, sin OPERATOR_PASSWORD, "operador" para probar la consola local sin configurar
  // nada. Nunca en producción: ahí sin OPERATOR_PASSWORD (o vacía) el dueño no entra, y el build de
  // producción frena antes (scripts/vercel-build.mjs).
  // Una variable puesta pero vacía o de puros espacios no es una clave (el build de producción usa
  // el mismo criterio). La clave de desarrollo, SÓLO con NODE_ENV exactamente "development": no con
  // la variable ausente, ni "test", ni "Production" mal escrito.
  const propia = env.OPERATOR_PASSWORD;
  if (propia !== undefined) return propia.trim() === "" ? undefined : propia;
  return env.NODE_ENV === "development" ? "operador" : undefined;
}

/**
 * ¿Nombre y clave son de un operador? Devuelve el nombre normalizado, o null.
 *   · el DUEÑO (nombre vacío, el login de siempre, o su nombre): SÓLO con OPERATOR_PASSWORD, que
 *     tiene que existir y no estar vacía. Una línea de OPERADORES con su nombre no cuenta;
 *   · otro nombre: contra su línea PBKDF2 de OPERADORES.
 * Una clave vacía nunca entra, por ningún camino.
 */
export async function verificarOperador(
  nombreTipeado: string,
  clave: string,
  env: Env = process.env,
): Promise<string | null> {
  const duenio = operadorDuenio(env);
  const nombre = nombreTipeado.trim() === "" ? duenio : normalizarNombreOperador(nombreTipeado);
  if (nombre && nombre === duenio) {
    const esperada = passwordDelDuenio(env);
    return clave !== "" && esperada !== undefined && igualesEnTiempoConstante(clave, esperada) ? nombre : null;
  }
  const linea = nombre ? operadoresConfigurados(env).get(nombre) : undefined;
  // Nombre desconocido: se gasta el mismo trabajo que una verificación real.
  const coincide = await claveCoincide(clave, linea ?? VALOR_SENUELO);
  return nombre && linea && clave !== "" && coincide ? nombre : null;
}
