// ============================================================================
// PORTÓN DEL SITIO PÚBLICO — la vidriera pide una clave antes de mostrarse.
// ============================================================================
//
// Para qué: mientras el sitio de un tenant no está listo para que lo vea
// cualquiera (precios provisorios, agenda sin terminar de configurar, campaña sin
// lanzar), la vidriera tiene que quedar cerrada. No es seguridad de datos — el
// backoffice ya tiene su propio login y su RLS — es un cartel de "todavía no".
// Una sola clave compartida, la misma para todos los que la tengan que ver.
//
// APAGADO POR DEFECTO: sin `SITE_GATE_PASSWORD` en el entorno, esto no hace nada
// y el sitio se comporta EXACTAMENTE como hoy. Encender y apagar es poner o sacar
// una variable de entorno; no hay que tocar código ni volver a deployar el front.
//
// EDGE-SAFE a propósito: lo importa `src/proxy.ts` (middleware, corre en edge), así
// que usa SOLO Web Crypto. Mismo criterio que `auth.ts`, del que copia la mecánica
// de firma para no inventar un segundo esquema de tokens.
//
// La cookie NO guarda la clave: guarda una marca firmada con `AUTH_SECRET`. Quien
// la tenga entra; quien la manipule, no. Cambiar `SITE_GATE_PASSWORD` invalida
// todas las cookies emitidas (la firma incluye la clave vigente), así que rotar la
// clave echa a todos de una.

const COOKIE_NAME = "site_gate";
const PAYLOAD = "ok";

/** Días que dura el permiso antes de volver a pedir la clave. */
export const GATE_MAX_AGE_DAYS = 30;

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string, password: string) {
  const secret = `${process.env.AUTH_SECRET ?? "dev-secret"}::${password}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function timingSafeStringEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function getGateCookieName() {
  return COOKIE_NAME;
}

/**
 * La clave configurada, o `null` si el portón está apagado. Se recorta: una
 * variable de entorno con espacios en blanco cuenta como no configurada, así un
 * `SITE_GATE_PASSWORD=" "` accidental no deja el sitio cerrado con una clave que
 * nadie puede tipear.
 */
export function gatePassword(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.SITE_GATE_PASSWORD ?? "").trim();
  return raw.length > 0 ? raw : null;
}

/** ¿El portón está encendido? */
export function siteGateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return gatePassword(env) !== null;
}

/** Token para la cookie. Firmado con AUTH_SECRET + la clave vigente. */
export async function createGateToken(password: string): Promise<string> {
  return `${PAYLOAD}.${await sign(PAYLOAD, password)}`;
}

/** ¿La cookie es válida para la clave vigente? */
export async function readGateToken(
  token: string | undefined,
  password: string,
): Promise<boolean> {
  if (!token) return false;
  const sep = token.lastIndexOf(".");
  if (sep <= 0) return false;
  const payload = token.slice(0, sep);
  const signature = token.slice(sep + 1);
  if (payload !== PAYLOAD || !signature) return false;
  return timingSafeStringEqual(signature, await sign(payload, password));
}

/** ¿La clave tipeada es la correcta? Comparación de tiempo constante. */
export function gatePasswordMatches(intento: string, password: string): boolean {
  return timingSafeStringEqual(intento, password);
}

/** La pantalla donde se pide la clave. */
export const GATE_PATH = "/acceso";

// Rutas que NUNCA pasan por el portón, aunque esté encendido:
//   * el propio portón (si no, no habría cómo entrar);
//   * las superficies con su PROPIO login — backoffice, consola de operador,
//     panel del contador y Facturita: cerrarlas dos veces sólo molesta a quien
//     trabaja, y su portón real es más estricto que una clave compartida;
//   * las APIs — webhooks (Mercado Pago), cron y la API pública de pedidos no
//     tienen navegador donde tipear una clave; taparlas rompería cobros y
//     recordatorios en silencio.
const SIEMPRE_ABIERTAS = [
  GATE_PATH,
  "/admin",
  "/operador",
  "/contador",
  "/facturita",
  "/api",
];

/**
 * ¿Esta ruta necesita la clave? PURA — la usa el middleware y se testea sin red.
 *
 * `extraAbiertas` viene de `SITE_GATE_PUBLIC_PATHS` (lista separada por comas):
 * sirve para dejar una landing puntual accesible sin abrir todo el sitio — el caso
 * real es `/obsequio`, la campaña de apertura que se reparte por QR impreso y que
 * no serviría de nada detrás de una clave.
 */
export function gateAplicaA(pathname: string, extraAbiertas: readonly string[] = []): boolean {
  const abiertas = [...SIEMPRE_ABIERTAS, ...extraAbiertas];
  return !abiertas.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/** Lee `SITE_GATE_PUBLIC_PATHS` y la normaliza a una lista de rutas. */
export function extraPublicPaths(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.SITE_GATE_PUBLIC_PATHS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("/"));
}
