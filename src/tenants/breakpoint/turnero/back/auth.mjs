// INGRESO DEL CLIENTE — Turnero de Break Point Pádel.
//
// Dos caminos, los dos de un toque para el jugador:
//   · Google (OpenID Connect): el front recibe un ID token de Google Identity Services y el back lo verifica
//     (firma RS256 contra las claves públicas de Google, emisor, audiencia, vencimiento, mail verificado).
//     En DEMO no hay client id: se usa una cuenta de Google simulada y se dice en pantalla.
//   · Celular o mail + contraseña: scrypt con sal (nunca texto plano), comparación en tiempo constante,
//     límite de intentos por IP y por usuario (SEC-3).
// La sesión es una cookie HttpOnly + SameSite=Lax con un id aleatorio de 256 bits; el estado vive en memoria
// (demo: no se persiste nada — ciclo DEMO → VENTA → INVERSIÓN).
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createPublicKey, createVerify } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ───────────────────────── contraseñas ─────────────────────────

const COMUNES = new Set(["12345678", "123456789", "1234567890", "password", "contraseña", "contrasena", "qwertyui", "11111111", "00000000", "breakpoint", "padel123", "padelpadel", "abcd1234"]);

/** Reglas de la contraseña en criollo. null = está bien. */
export function problemaDeClave(clave) {
  const c = String(clave ?? "");
  if (c.length < 8) return "La contraseña tiene que tener al menos 8 caracteres.";
  if (c.length > 128) return "La contraseña es demasiado larga.";
  if (COMUNES.has(c.toLowerCase())) return "Esa contraseña es muy fácil de adivinar. Probá con otra.";
  return null;
}

export async function hashClave(clave) {
  const sal = randomBytes(16);
  const h = await scrypt(String(clave).normalize("NFKC"), sal, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString("base64url")}$${Buffer.from(h).toString("base64url")}`;
}

// Hash de relleno: si el usuario no existe se verifica igual contra esto, así el tiempo de respuesta no revela
// qué usuarios existen.
let HASH_RELLENO = null;
export async function verificarClave(clave, guardado) {
  HASH_RELLENO ??= await hashClave(randomBytes(12).toString("hex"));
  const usar = guardado || HASH_RELLENO;
  const [alg, N, r, p, sal, hash] = usar.split("$");
  if (alg !== "scrypt") return false;
  const esperado = Buffer.from(hash, "base64url");
  const h = Buffer.from(await scrypt(String(clave ?? "").normalize("NFKC"), Buffer.from(sal, "base64url"), esperado.length, { N: +N, r: +r, p: +p }));
  return Boolean(guardado) && h.length === esperado.length && timingSafeEqual(h, esperado);
}

// ───────────────────────── límite de intentos ─────────────────────────

/**
 * Ventana deslizante en memoria. `golpe(clave)` cuenta un intento; `bloqueado(clave)` dice si se pasó.
 * Para el ingreso: 5 fallos por usuario y 20 por IP cada 15 minutos.
 */
export function crearLimitador({ maximo, ventanaMs, ahora = () => Date.now() }) {
  const golpes = new Map();
  const vivos = (k) => {
    const t = ahora();
    const l = (golpes.get(k) ?? []).filter((x) => t - x < ventanaMs);
    if (l.length) golpes.set(k, l); else golpes.delete(k);
    return l;
  };
  return {
    golpe(k) { const l = vivos(k); l.push(ahora()); golpes.set(k, l); return l.length; },
    bloqueado: (k) => vivos(k).length >= maximo,
    reiniciar: (k) => golpes.delete(k),
    /** Segundos hasta que se libera (para el mensaje "probá de nuevo en X minutos"). */
    espera(k) { const l = vivos(k); return l.length < maximo ? 0 : Math.ceil((ventanaMs - (ahora() - l[0])) / 1000); },
  };
}

// ───────────────────────── sesiones ─────────────────────────

export function crearSesiones({ duracionMs = 30 * 86400000, ahora = () => Date.now() } = {}) {
  const sesiones = new Map();
  return {
    crear(usuarioId) {
      const id = randomBytes(32).toString("base64url");
      sesiones.set(id, { usuarioId, vence: ahora() + duracionMs });
      return id;
    },
    leer(id) {
      const s = id ? sesiones.get(id) : null;
      if (!s) return null;
      if (s.vence < ahora()) { sesiones.delete(id); return null; }
      s.vence = ahora() + duracionMs; // sesión deslizante: si juega seguido, no le pedimos que entre de nuevo
      return s;
    },
    cerrar: (id) => sesiones.delete(id),
    duracionSeg: Math.floor(duracionMs / 1000),
  };
}

export function leerCookies(header) {
  const out = {};
  for (const parte of String(header ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

export function cookieSesion(nombre, valor, { maxAge, seguro }) {
  return `${nombre}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro ? "; Secure" : ""}`;
}

// ───────────────────────── identidad ─────────────────────────

/** "11 6187-0066" · "+54 9 11 6187 0066" → "5491161870066". Celular argentino (10 dígitos con característica). */
export function normalizarCelular(tel) {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9")) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) d = d.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2"); // 011 15 xxxx → sin el 15
  return d.length === 10 ? `549${d}` : null;
}

export function normalizarEmail(e) {
  const v = String(e ?? "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(v) ? v : null;
}

// ───────────────────────── Google (OpenID Connect) ─────────────────────────

const EMISORES_GOOGLE = new Set(["accounts.google.com", "https://accounts.google.com"]);
const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

/**
 * Verifica un ID token de Google. `obtenerJwks()` devuelve { keys: [...] } (en producción, de
 * https://www.googleapis.com/oauth2/v3/certs con caché; en los tests, claves generadas en el momento).
 * Devuelve { ok, perfil: { sub, email, nombre } } o { ok: false, motivo }.
 */
export async function verificarIdTokenGoogle(idToken, { clientId, obtenerJwks, ahoraSeg = () => Math.floor(Date.now() / 1000) }) {
  try {
    const partes = String(idToken ?? "").split(".");
    if (partes.length !== 3) return { ok: false, motivo: "Token inválido." };
    const [h64, p64, s64] = partes;
    const cab = b64json(h64), datos = b64json(p64);
    if (cab.alg !== "RS256") return { ok: false, motivo: "Algoritmo no permitido." };
    const jwk = (await obtenerJwks()).keys?.find((k) => k.kid === cab.kid);
    if (!jwk) return { ok: false, motivo: "Clave desconocida." };
    const v = createVerify("RSA-SHA256");
    v.update(`${h64}.${p64}`);
    if (!v.verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s64, "base64url"))) return { ok: false, motivo: "Firma inválida." };
    const t = ahoraSeg();
    if (!EMISORES_GOOGLE.has(datos.iss)) return { ok: false, motivo: "Emisor inválido." };
    if (datos.aud !== clientId) return { ok: false, motivo: "El token no es para esta app." };
    if (!(datos.exp > t - 60)) return { ok: false, motivo: "El token venció." };
    if (datos.iat && datos.iat > t + 300) return { ok: false, motivo: "Token del futuro." };
    if (!datos.email || datos.email_verified === false || datos.email_verified === "false") return { ok: false, motivo: "La cuenta de Google no tiene el mail verificado." };
    return { ok: true, perfil: { sub: String(datos.sub), email: normalizarEmail(datos.email), nombre: String(datos.name ?? datos.given_name ?? datos.email).slice(0, 80) } };
  } catch {
    return { ok: false, motivo: "Token inválido." };
  }
}

/** JWKS de Google con caché (respeta el max-age que manda Google). Sólo se usa con GOOGLE_CLIENT_ID real. */
export function jwksDeGoogle({ fetch: f = globalThis.fetch, ahora = () => Date.now() } = {}) {
  let cache = null, vence = 0;
  return async () => {
    if (cache && ahora() < vence) return cache;
    const r = await f("https://www.googleapis.com/oauth2/v3/certs");
    const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    cache = await r.json();
    vence = ahora() + maxAge * 1000;
    return cache;
  };
}

/** Cuentas de Google de DEMO (ficticias: dominio example.com reservado por RFC 2606). */
export const GOOGLE_DEMO = Object.freeze([
  { sub: "demo-google-1", email: "jugador.demo@example.com", nombre: "Jugador Demo" },
  { sub: "demo-google-2", email: "jugadora.demo@example.com", nombre: "Jugadora Demo" },
]);
