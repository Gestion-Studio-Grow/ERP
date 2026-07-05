// Auth del PLANO DE OPERADOR (control-plane, ADR-021) — separado del auth de tenant.
//
// EDGE-SAFE A PROPÓSITO: lo importa `src/proxy.ts` (middleware, edge), así que usa
// SOLO Web Crypto. Es un plano de autorización DISTINTO al de tenant (ADR-021 §2.a-B):
// cookie propia (`operator_session`), secreto propio (`OPERATOR_SECRET`), y NADA que
// lo ate al `UserRole`/sesión de ningún tenant. El operador somos nosotros; la
// credencial es un secreto de entorno (patrón de bootstrap de ADR-017), no una fila
// de `User`. Cuando haya más de un operador se sube a una tabla `PlatformAdmin`.

const OPERATOR_COOKIE = "operator_session";
// Marcador firmado en la cookie. Con un único operador alcanza un payload fijo; el
// día que haya varios, acá va el id del PlatformAdmin.
const OPERATOR_SUBJECT = "operator";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function operatorSecret(): string {
  // Secreto propio del plano; cae a AUTH_SECRET solo en dev. En prod debe setearse
  // OPERATOR_SECRET distinto del de la app del tenant (separación de llaveros).
  return process.env.OPERATOR_SECRET ?? process.env.AUTH_SECRET ?? "dev-operator-secret";
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(operatorSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(signature);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function getOperatorCookieName(): string {
  return OPERATOR_COOKIE;
}

export async function createOperatorToken(): Promise<string> {
  return `${OPERATOR_SUBJECT}.${await sign(OPERATOR_SUBJECT)}`;
}

// Verifica la firma y devuelve el subject del operador, o null. NO toca DB (edge).
export async function readOperatorToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const sep = token.lastIndexOf(".");
  if (sep <= 0) return null;
  const payload = token.slice(0, sep);
  const signature = token.slice(sep + 1);
  if (!payload || !signature) return null;
  const expected = await sign(payload);
  if (!timingSafeStringEqual(signature, expected)) return null;
  return payload;
}

// Verifica la contraseña de operador contra el secreto de entorno. En dev, si no hay
// OPERATOR_PASSWORD seteada, acepta "operador" para poder probar la consola local sin
// configurar nada (nunca en producción: ahí OPERATOR_PASSWORD es obligatoria).
export function checkOperatorPassword(password: string): boolean {
  const expected = process.env.OPERATOR_PASSWORD ?? (process.env.NODE_ENV !== "production" ? "operador" : undefined);
  if (!expected) return false;
  if (password.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < password.length; i++) result |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  return result === 0;
}
