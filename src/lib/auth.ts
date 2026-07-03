// Firma y verificación del token de sesión del panel (ADR-017 §2.c).
//
// EDGE-SAFE A PROPÓSITO: este módulo lo importa `src/proxy.ts` (middleware, corre
// en edge), así que usa SOLO Web Crypto (crypto.subtle) — nada de node:crypto ni
// Prisma. El payload firmado es el `userId` (antes era el string fijo "admin").
// El hashing de contraseñas (node:crypto scrypt) vive en `auth-password.ts` y la
// carga del usuario desde la base (Prisma) en `session.ts` — ninguno de los dos
// entra al bundle edge por esta vía.

const COOKIE_NAME = "admin_session";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string) {
  const secret = process.env.AUTH_SECRET ?? "dev-secret";
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

export async function createSessionToken(userId: string) {
  return `${userId}.${await sign(userId)}`;
}

// Verifica la firma del token y devuelve el `userId` firmado, o null si el token
// falta / está mal formado / la firma no valida. NO carga el usuario de la base
// (eso es `getCurrentUser()` en session.ts, runtime Node): esto es el portón
// grueso que puede correr en edge.
export async function readSessionToken(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) return null;
  const sepIndex = token.lastIndexOf(".");
  if (sepIndex <= 0) return null;
  const payload = token.slice(0, sepIndex);
  const signature = token.slice(sepIndex + 1);
  if (!payload || !signature) return null;
  const expected = await sign(payload);
  if (!timingSafeStringEqual(signature, expected)) return null;
  return payload;
}
