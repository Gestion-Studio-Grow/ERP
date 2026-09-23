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
 *   3. `readOperatorToken` exige que el payload sea el sujeto del operador, no cualquier cosa.
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
  // Sólo el sujeto del operador: un id de usuario de un negocio no es un operador aunque su firma
  // valide (ver operatorSecret).
  if (payload !== OPERATOR_SUBJECT) return null;
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
