// ============================================================================
// CLAVE DE UN OPERADOR — la línea de OPERADORES, con PBKDF2 de Web Crypto.
// ============================================================================
//
// OPERADORES = "nombre=pbkdf2$<sal>$<hash>;otro=pbkdf2$<sal>$<hash>"
//   · sal: 16 bytes al azar, en hex (32 caracteres);
//   · hash: PBKDF2-SHA-256 de la clave con esa sal, 600.000 vueltas, 32 bytes en hex (64).
// En la variable de entorno nunca va la clave: sólo lo que sirve para verificarla.
//
// La MISMA función la usan dos lados, y por eso vive acá, sin nada de servidor:
//   · el login de la consola (src/lib/operator-auth.ts) para verificar;
//   · /operador/clave, que arma la línea EN EL NAVEGADOR: la clave no viaja a ningún lado.
// Sólo Web Crypto (crypto.subtle): corre igual en Node, en el edge y en el navegador.

/** Nombre de operador: minúsculas, números, guion y guion bajo. Sin "|" ni ".": van en el token. */
export const NOMBRE_OPERADOR_VALIDO = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/**
 * "Tomás Pérez" → "tomas-perez". `null` si no queda un nombre válido. Así el nombre que se tipea
 * en el login, el de /operador/clave y el de la variable coinciden aunque cambien mayúsculas o tildes.
 */
export function normalizarNombreOperador(raw: string | null | undefined): string | null {
  const n = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return NOMBRE_OPERADOR_VALIDO.test(n) ? n : null;
}

/**
 * El nombre para una línea NUEVA de OPERADORES (lo usa /operador/clave). El del dueño está
 * reservado: el dueño entra sólo con OPERATOR_PASSWORD y el servidor ignora una línea con su nombre.
 */
export function nombreParaLineaNueva(
  raw: string,
  nombreDelDuenio: string,
): { ok: true; nombre: string } | { ok: false; motivo: string } {
  const n = normalizarNombreOperador(raw);
  if (!n) return { ok: false, motivo: "El nombre va con letras, números, guion o guion bajo (hasta 32)." };
  if (n === normalizarNombreOperador(nombreDelDuenio)) {
    return { ok: false, motivo: `«${n}» es el nombre del dueño de GSG y está reservado: elegí otro nombre.` };
  }
  return { ok: true, nombre: n };
}

/** Vueltas de PBKDF2-SHA-256. Fijas: cambiarlas invalida todas las líneas de OPERADORES. */
export const ITERACIONES_PBKDF2 = 600_000;

const BYTES_SAL = 16;
const BITS_HASH = 256;

/** El valor de un operador en OPERADORES (lo que va después de "nombre="). */
export const FORMATO_LINEA = /^pbkdf2\$([0-9a-f]{32})\$([0-9a-f]{64})$/;

export function bytesAHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexABytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** PBKDF2-SHA-256 de `clave` con la sal en hex. Devuelve el hash en hex. */
export async function derivarHash(clave: string, salHex: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexABytes(salHex), iterations: ITERACIONES_PBKDF2 },
    base,
    BITS_HASH,
  );
  return bytesAHex(new Uint8Array(bits));
}

/** "pbkdf2$<sal>$<hash>" para esta clave. La sal sale al azar salvo que se pase (tests). */
export async function valorDeClave(clave: string, sal?: Uint8Array): Promise<string> {
  const s = sal ?? crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const salHex = bytesAHex(s);
  return `pbkdf2$${salHex}$${await derivarHash(clave, salHex)}`;
}

/** Comparación en tiempo constante (para el largo, que es fijo en este formato). */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** ¿`clave` corresponde a `valor` ("pbkdf2$sal$hash")? Un valor mal formado nunca verifica. */
export async function claveCoincide(clave: string, valor: string): Promise<boolean> {
  const m = FORMATO_LINEA.exec(valor);
  if (!m) return false;
  return igualesEnTiempoConstante(await derivarHash(clave, m[1]), m[2]);
}
