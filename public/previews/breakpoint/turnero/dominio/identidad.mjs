// IDENTIDAD DEL JUGADOR — lo puro del ingreso, isomórfico (Node 22 y navegador: sólo Web Crypto).
//
// Lo usan el back (src/tenants/breakpoint/turnero/back/auth.mjs, que suma scrypt y Google OIDC) y el adaptador
// local de la demo pública (../local.mjs), que corre el mismo núcleo en el navegador cuando no hay servidor.

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

const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/**
 * PBKDF2-SHA256 con Web Crypto: el hash de la demo local (el back usa scrypt). Nunca texto plano.
 * 100.000 iteraciones: suficiente para una demo que vive en la memoria del propio navegador.
 */
export async function hashPbkdf2(clave, iteraciones = 100000) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivar(clave, sal, iteraciones);
  return `pbkdf2$${iteraciones}$${b64(sal)}$${b64(bits)}`;
}
async function derivar(clave, sal, iteraciones) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(clave ?? "").normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones }, k, 256));
}
export async function verificarPbkdf2(clave, guardado) {
  const [alg, it, sal, hash] = String(guardado ?? "pbkdf2$1000$AAAAAAAAAAAAAAAAAAAAAA$").split("$");
  if (alg !== "pbkdf2") return false;
  const h = await derivar(clave, deB64(sal), Number(it));
  const esperado = deB64(hash);
  let dif = h.length ^ esperado.length;
  for (let i = 0; i < Math.min(h.length, esperado.length); i++) dif |= h[i] ^ esperado[i]; // tiempo parejo
  return Boolean(guardado) && dif === 0;
}

// ───────────────────────── datos de contacto ─────────────────────────

/** "11 6187-0066" · "+54 9 11 6187 0066" · "011 15 6187-0066" → "5491161870066". Celular argentino. */
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

/** Cuentas de Google de DEMO (ficticias: dominio example.com, reservado por RFC 2606). */
export const GOOGLE_DEMO = Object.freeze([
  { sub: "demo-google-1", email: "jugador.demo@example.com", nombre: "Jugador Demo" },
  { sub: "demo-google-2", email: "jugadora.demo@example.com", nombre: "Jugadora Demo" },
]);

/** Entero al azar en [0, n) con Web Crypto (sin sesgo apreciable para n chico). */
export const azar = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
