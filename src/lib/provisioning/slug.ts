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

/**
 * Subdominios que nunca pueden ser de un negocio: `www` es la puerta del dominio propio y el ruteo
 * lo trata como el dominio a secas (tenant.ts, `extractSubdomain`), así que ese negocio no abriría.
 */
const HOSTS_RESERVADOS = new Set(["www"]);

export function isValidHost(subdomain: string): boolean {
  return HOST_RE.test(subdomain) && !HOSTS_RESERVADOS.has(subdomain);
}

/**
 * El subdominio que carga el operador en la ficha de un negocio: sin espacios, en minúsculas y con
 * el mismo formato que exige el alta (`isValidHost`), hasta 63 caracteres (una etiqueta DNS). Vacío
 * = borrarlo (`null`). Un valor inválido vuelve con el motivo: no se corrige en silencio.
 */
export function leerSubdominio(raw: string): { ok: true; subdominio: string | null } | { ok: false; motivo: string } {
  const v = raw.trim().toLowerCase();
  if (v === "") return { ok: true, subdominio: null };
  if (HOSTS_RESERVADOS.has(v)) {
    return { ok: false, motivo: `"${raw.trim()}" está reservado para la dirección general: elegí otro nombre para el negocio.` };
  }
  if (v.length > 63 || !isValidHost(v)) {
    return {
      ok: false,
      motivo: `"${raw.trim()}" no es un subdominio válido: van letras minúsculas, números y guiones simples (sin puntos ni espacios, hasta 63).`,
    };
  }
  return { ok: true, subdominio: v };
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
