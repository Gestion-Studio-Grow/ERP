// Fábrica de tenants — normalización y validación de slug/host (ADR-074).
//
// El slug es el identificador de direccionamiento del tenant y la clave de idempotencia
// de DB (ADR-019 §5.2). Regla de ADR-019: NO se auto-corrige en silencio — si no matchea,
// el plan lo reporta como colisión, para que el operador lo escriba bien a propósito y no
// termine con dos slugs casi iguales. `suggestSlug` SÍ propone (para el wizard), pero la
// validación dura sigue siendo del usuario (RFC-003 §3.1 paso 1).

/** kebab-case URL-safe: minúsculas, dígitos y guiones simples. Igual criterio que ADR-019. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Un subdominio válido es un slug (mismo alfabeto de host DNS-safe, sin punto). */
const HOST_RE = SLUG_RE;

/** Rango de diacríticos combinantes (Unicode Combining Diacritical Marks) para limpiar tras NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function isValidHost(subdomain: string): boolean {
  return HOST_RE.test(subdomain);
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * Propone un slug a partir del nombre (para el auto-sugerido del wizard). Baja a minúsculas,
 * saca acentos, reemplaza lo no alfanumérico por guiones y colapsa/recorta guiones. Es una
 * SUGERENCIA: el operador la confirma y la validación dura corre igual.
 */
export function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "") // saca diacríticos combinantes (NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
