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
import { normalizarEmail } from "../../../../../public/previews/breakpoint/turnero/dominio/identidad.mjs";

// Lo puro (reglas de contraseña, celular, mail, cuentas de demo) vive en el dominio compartido con el front.
export { problemaDeClave, normalizarCelular, normalizarEmail, GOOGLE_DEMO } from "../../../../../public/previews/breakpoint/turnero/dominio/identidad.mjs";

const scrypt = promisify(scryptCb);
// Parámetros OWASP de baja memoria (N=2^14, r=8, p=5 ≈ 16 MB por hash): mismo costo que N=2^17,p=1 sin 128 MB por pedido.
const SCRYPT = { N: 16384, r: 8, p: 5, keylen: 64 };

// ───────────────────────── contraseñas ─────────────────────────

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
