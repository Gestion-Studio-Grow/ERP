// ============================================================================
// COLOR — OKLCH ↔ sRGB y contraste WCAG, sin DOM y sin dependencias.
// ============================================================================
//
// La piel «Renglón» declara sus colores en OKLCH (src/design/tokens.ts) y deriva el acento de
// cada negocio con `color-mix(in oklch, …)`. Este módulo hace la misma cuenta que el navegador para
// poder MEDIR el contraste de cada par antes de que llegue a una pantalla:
//
//   OKLCH → OKLab → sRGB lineal → (recorte al gamut) → sRGB → luminancia relativa → razón WCAG.
//
// Fórmulas: OKLab de Björn Ottosson (las matrices que cita CSS Color 4 §"OKLab"); luminancia y razón
// de contraste de WCAG 2.2 (1.4.3 y 1.4.11). `color-mix` sigue CSS Color 5 §"color-mix()": porcentajes
// normalizados, alfa premultiplicado y el tono por el arco corto; un color acromático no aporta tono.
// Lo translúcido se compone sobre su fondo en sRGB con gamma, que es como pinta el navegador.
//
// Lo usan el test de contraste (tokens.test.ts), el generador de la hoja y la galería. Puro.

/** sRGB con gamma, cada canal 0..1, alfa 0..1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** OKLCH: l 0..1, c ≥ 0, h en grados o `null` si el tono no cuenta (acromático). */
export interface Oklch {
  l: number;
  c: number;
  h: number | null;
  a: number;
}

/** Debajo de este croma el tono no existe (blanco, negro, grises): no se interpola. */
const CROMA_ACROMATICO = 1e-4;

function aLineal(u: number): number {
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

function aGamma(u: number): number {
  return u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
}

const recortar = (u: number) => Math.min(1, Math.max(0, u));

/** OKLCH → sRGB lineal SIN recortar (puede salir del gamut: sirve para medirlo). */
export function oklchALinealCrudo(c: Oklch): [number, number, number] {
  const h = ((c.h ?? 0) * Math.PI) / 180;
  const A = c.c * Math.cos(h);
  const B = c.c * Math.sin(h);
  const l_ = c.l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = c.l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = c.l - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** ¿Este OKLCH entra en sRGB? (con una tolerancia de redondeo). */
export function dentroDeSrgb(c: Oklch, tolerancia = 0.002): boolean {
  return oklchALinealCrudo(c).every((u) => u >= -tolerancia && u <= 1 + tolerancia);
}

/** OKLCH → sRGB con gamma. Fuera del gamut se recorta canal por canal. */
export function oklchASrgb(c: Oklch): Rgb {
  const [r, g, b] = oklchALinealCrudo(c);
  return { r: recortar(aGamma(recortar(r))), g: recortar(aGamma(recortar(g))), b: recortar(aGamma(recortar(b))), a: c.a };
}

/** sRGB con gamma → OKLCH. */
export function srgbAOklch(rgb: Rgb): Oklch {
  const r = aLineal(rgb.r);
  const g = aLineal(rgb.g);
  const b = aLineal(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  const h = c < CROMA_ACROMATICO ? null : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h, a: rgb.a };
}

// ── Lectura de valores CSS ──────────────────────────────────────────────────────────────────

const NOMBRES: Record<string, Rgb> = {
  white: { r: 1, g: 1, b: 1, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function leerHex(s: string): Rgb | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

function leerNumero(s: string, escalaPorciento: number): number {
  const t = s.trim();
  if (t === "none") return 0;
  if (t.endsWith("%")) return (parseFloat(t) / 100) * escalaPorciento;
  return parseFloat(t);
}

/** `oklch(97% 0.004 95)`, `oklch(0.2 0.01 265 / 0.12)`. `none` en el tono = acromático. */
function leerOklch(s: string): Oklch | null {
  const m = /^oklch\(\s*([^)]*)\)$/i.exec(s.trim());
  if (!m) return null;
  const [canales, alfa] = m[1].split("/");
  const partes = canales.trim().split(/\s+/);
  if (partes.length !== 3) return null;
  const l = leerNumero(partes[0], 1);
  const c = leerNumero(partes[1], 0.4);
  const hTexto = partes[2].trim();
  const h = hTexto === "none" ? null : parseFloat(hTexto);
  const a = alfa === undefined ? 1 : leerNumero(alfa, 1);
  if ([l, c, a].some((x) => Number.isNaN(x)) || (h !== null && Number.isNaN(h))) return null;
  return { l, c, h: c < CROMA_ACROMATICO ? null : h, a };
}

/** Un color CSS "hoja" (sin var() ni color-mix): hex, oklch() o nombre básico. */
export function leerColor(s: string): Oklch {
  const t = s.trim().toLowerCase();
  const nombre = NOMBRES[t];
  if (nombre) return srgbAOklch(nombre);
  const hex = leerHex(t);
  if (hex) return srgbAOklch(hex);
  const ok = leerOklch(t);
  if (ok) return ok;
  throw new Error(`color que no sé leer: "${s}"`);
}

// ── color-mix(in oklch, …) ──────────────────────────────────────────────────────────────────

/** Una parte de un color-mix: el color y su porcentaje (o `null` si no lo dice). */
export interface ParteMezcla {
  color: Oklch;
  porcentaje: number | null;
}

/**
 * `color-mix(in oklch, A p%, B q%)` como CSS Color 5: normaliza los porcentajes (si suman menos de
 * 100 %, el alfa del resultado baja en esa proporción), premultiplica por alfa, interpola L y C en
 * línea recta y el tono por el arco corto. Si uno de los dos es acromático, manda el tono del otro.
 */
export function mezclarOklch(a: ParteMezcla, b: ParteMezcla): Oklch {
  let p1 = a.porcentaje;
  let p2 = b.porcentaje;
  if (p1 === null && p2 === null) {
    p1 = 50;
    p2 = 50;
  } else if (p1 === null) p1 = 100 - (p2 as number);
  else if (p2 === null) p2 = 100 - p1;
  const suma = (p1 as number) + (p2 as number);
  if (suma <= 0) throw new Error("color-mix con porcentajes que suman 0");
  const multAlfa = suma < 100 ? suma / 100 : 1;
  const w1 = (p1 as number) / suma;
  const w2 = (p2 as number) / suma;

  const c1 = a.color;
  const c2 = b.color;
  const alfa = c1.a * w1 + c2.a * w2;
  const pre = (x1: number, x2: number) => (alfa === 0 ? 0 : (x1 * c1.a * w1 + x2 * c2.a * w2) / alfa);

  let h: number | null;
  if (c1.h === null && c2.h === null) h = null;
  else if (c1.h === null) h = c2.h;
  else if (c2.h === null) h = c1.h;
  else {
    let d = c2.h - c1.h;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    h = (((c1.h + d * w2) % 360) + 360) % 360;
  }
  const c = pre(c1.c, c2.c);
  return { l: pre(c1.l, c2.l), c, h: c < CROMA_ACROMATICO ? null : h, a: alfa * multAlfa };
}

// ── Contraste ───────────────────────────────────────────────────────────────────────────────

/** Compone un color translúcido sobre un fondo opaco, en sRGB con gamma (como el navegador). */
export function componer(frente: Rgb, fondo: Rgb): Rgb {
  const a = frente.a;
  return {
    r: frente.r * a + fondo.r * (1 - a),
    g: frente.g * a + fondo.g * (1 - a),
    b: frente.b * a + fondo.b * (1 - a),
    a: 1,
  };
}

/** Luminancia relativa WCAG de un sRGB opaco. */
export function luminancia(c: Rgb): number {
  return 0.2126 * aLineal(c.r) + 0.7152 * aLineal(c.g) + 0.0722 * aLineal(c.b);
}

/** Razón de contraste WCAG entre dos colores opacos (1..21). */
export function razonContraste(x: Rgb, y: Rgb): number {
  const lx = luminancia(x);
  const ly = luminancia(y);
  const [claro, oscuro] = lx >= ly ? [lx, ly] : [ly, lx];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** sRGB → "#rrggbb" (para mostrar y para los mensajes del test). */
export function aHex(c: Rgb): string {
  const x = (u: number) => Math.round(recortar(u) * 255).toString(16).padStart(2, "0");
  return `#${x(c.r)}${x(c.g)}${x(c.b)}`;
}
