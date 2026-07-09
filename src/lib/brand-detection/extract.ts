// ============================================================================
// DETECCIÓN DE MARCA — extracción de señales del HTML (v1). PURO, testeable.
// ============================================================================
//
// Dado el HTML de la web/red del cliente, extrae las SEÑALES de identidad que se pueden
// leer del markup declarado (RFC-004-B §2): título, theme-color, colores dominantes de
// los estilos, logo (favicon / og:image / <img> "logo") y tipografías aproximadas.
//
// LÍMITE v1 explícito: lee lo DECLARADO en el HTML/CSS inline; NO decodifica píxeles del
// logo ni de la og:image (eso es v2, requiere decodificar la imagen). Aun así alcanza para
// una PROPUESTA de branding que un humano confirma en el alta. Sin red: recibe el HTML.

import { normalizeHex, rgbFuncToHex, isNeutral } from "./color";

export type BrandSignals = {
  /** Nombre del negocio (de <title> u og:site_name), limpiado. */
  title: string | null;
  /** `<meta name="theme-color">` normalizado (la pista más fuerte del color de marca). */
  themeColor: string | null;
  /** Colores no-neutros hallados en los estilos, por frecuencia desc. */
  colors: { hex: string; count: number }[];
  /** URL absoluta del logo/ícono, si se encontró. */
  logo: string | null;
  /** Familias tipográficas declaradas (primera de cada `font-family`), únicas. */
  fonts: string[];
};

// Absolutiza una URL relativa contra la base; devuelve null si es inservible.
function absolutize(href: string | null | undefined, baseUrl: string): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("data:")) return h || null;
  try {
    return new URL(h, baseUrl).href;
  } catch {
    return null;
  }
}

// Primer grupo de un match de atributo `name/property=... content="..."`.
function metaContent(html: string, nameRe: string): string | null {
  // Tolera orden invertido (content antes que name) probando ambas formas.
  const a = html.match(new RegExp(`<meta[^>]*(?:name|property)=["']${nameRe}["'][^>]*content=["']([^"']+)["']`, "i"));
  if (a?.[1]) return a[1].trim();
  const b = html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${nameRe}["']`, "i"));
  return b?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const og = metaContent(html, "og:site_name");
  if (og) return og;
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!t) return null;
  // "Magra · Canning — Comprá online" → "Magra": corta por el primer separador editorial.
  return t.split(/\s*[·|–—-]\s*/)[0]?.trim() || t;
}

function extractThemeColor(html: string): string | null {
  const raw = metaContent(html, "theme-color");
  if (!raw) return null;
  return normalizeHex(raw) ?? rgbFuncToHex(raw);
}

function extractColors(html: string): { hex: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (hex: string | null) => {
    if (!hex || isNeutral(hex)) return;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  for (const m of html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) bump(normalizeHex(m[0]));
  for (const m of html.matchAll(/rgba?\([^)]*\)/gi)) bump(rgbFuncToHex(m[0]));
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

function extractLogo(html: string, baseUrl: string): string | null {
  // 1) apple-touch-icon (suele ser el logo cuadrado nítido).
  const apple = html.match(/<link[^>]*rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (apple) return absolutize(apple, baseUrl);
  // 2) og:image (imagen para compartir; frecuentemente el logo/isotipo).
  const og = metaContent(html, "og:image");
  if (og) return absolutize(og, baseUrl);
  // 3) <link rel="icon"> / shortcut icon.
  const icon = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)?.[1];
  if (icon) return absolutize(icon, baseUrl);
  // 4) <img> cuyo src/alt/class huela a "logo".
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (/logo/i.test(tag)) {
      const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
      const abs = absolutize(src, baseUrl);
      if (abs) return abs;
    }
  }
  return null;
}

function extractFonts(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    if (!first) continue;
    const key = first.toLowerCase();
    // Descarta familias genéricas (no son identidad de marca).
    if (["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "system-ui"].includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(first);
  }
  return out;
}

/** Extrae todas las señales de marca del HTML. `baseUrl` absolutiza logos relativos. PURA. */
export function extractBrandSignals(html: string, baseUrl: string): BrandSignals {
  return {
    title: extractTitle(html),
    themeColor: extractThemeColor(html),
    colors: extractColors(html),
    logo: extractLogo(html, baseUrl),
    fonts: extractFonts(html),
  };
}
