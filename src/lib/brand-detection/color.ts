// ============================================================================
// DETECCIÓN DE MARCA — utilidades de color (v1). PURO, sin red, testeable.
// ============================================================================
//
// Base de la detección por IA (RFC-004-B): normalizar colores encontrados en la web
// del cliente, descartar los neutros (fondos/tinta) y mapear el color de marca al
// preset de acento más cercano del ERP (branding.ts). "IA v1" heurística y explicable
// (no una caja negra): mismas reglas, mismo resultado, auditable.

/**
 * Normaliza un color hex a `#rrggbb` en minúscula. Acepta `#rgb`, `#rrggbb`, `#rrggbbaa`
 * (descarta alfa). Devuelve null si no es un hex válido. PURA.
 */
export function normalizeHex(raw: string): string | null {
  let h = raw.trim().toLowerCase();
  if (!h.startsWith("#")) return null;
  h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  else if (h.length === 8) h = h.slice(0, 6); // descarta alfa
  if (h.length !== 6 || !/^[0-9a-f]{6}$/.test(h)) return null;
  return `#${h}`;
}

/** Convierte `rgb()`/`rgba()` (los 3 canales) a hex `#rrggbb`, o null. PURA. */
export function rgbFuncToHex(raw: string): string | null {
  const m = raw.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!m) return null;
  const to2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if ([r, g, b].some((n) => Number.isNaN(n) || n > 255)) return null;
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export type Rgb = [number, number, number];

/** Hex → [r,g,b] (0-255), o null. PURA. */
export function hexToRgb(hex: string): Rgb | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}

/** Distancia euclídea ponderada (aprox. perceptual, "redmean") entre dos colores. PURA. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Luminancia relativa aproximada 0..1 (para descartar casi-blanco/casi-negro). PURA. */
export function lightness(rgb: Rgb): number {
  const max = Math.max(...rgb) / 255;
  const min = Math.min(...rgb) / 255;
  return (max + min) / 2;
}

/** Saturación HSL 0..1 (para descartar grises). PURA. */
export function saturation(rgb: Rgb): number {
  const max = Math.max(...rgb) / 255;
  const min = Math.min(...rgb) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/**
 * ¿Es un color NEUTRO (fondo/tinta, no marca)? Descarta grises (baja saturación) y los
 * extremos de luminancia (casi-blanco/casi-negro). Umbrales v1, explicables. PURA.
 */
export function isNeutral(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const l = lightness(rgb);
  if (l > 0.93 || l < 0.07) return true; // casi blanco / casi negro
  return saturation(rgb) < 0.12; // gris
}
