// Contenido — la marca de la placa a partir del branding del negocio (PURO, client-safe).
// `@/lib/branding` arrastra Prisma en ejecución: acá sólo se importa su TIPO. El acento resuelto lo pasa quien llama
// (en el server: `resolveAccent(brand.preset, "light")`).
import type { TenantBrand } from "@/lib/branding";
import type { MarcaDeLaPlaca } from "./tipos";

/** Lo que se usa de `BusinessSettings`. */
export interface AjustesDelNegocio {
  whatsapp?: string | null;
  instagram?: string | null;
}

const NEUTRO = "#2c6e77";
const TINTA_CLARA = "#ffffff";
const TINTA_OSCURA = "#111111"; // design-lint-ignore: tinta del lienzo (canvas no lee variables CSS)
/** WCAG AA para texto chico. */
export const AA = 4.5;

type Rgb = [number, number, number];

function aRgb(hex: string): Rgb {
  let h = String(hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) h = NEUTRO.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}
const aHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Mezcla `a` con `b` en proporción `t` (0 = a, 1 = b). */
export function mezclar(a: string, b: string, t: number): string {
  const x = aRgb(a);
  const y = aRgb(b);
  return aHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

export function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** La tinta (clara u oscura) que más contrasta sobre `fondo`. */
export const textoSobre = (fondo: string): string =>
  contraste(fondo, TINTA_CLARA) >= contraste(fondo, TINTA_OSCURA) ? TINTA_CLARA : TINTA_OSCURA;

/** Corre el color hacia el negro o el blanco (lo que ya favorezca a su tinta) hasta que su texto llegue a AA. */
export function asegurarContraste(color: string): string {
  let c = aHex(aRgb(color));
  for (let i = 0; i < 20 && contraste(c, textoSobre(c)) < AA; i++) {
    c = mezclar(c, textoSobre(c) === TINTA_CLARA ? "#000000" : "#ffffff", 0.08); // design-lint-ignore: cálculo de contraste en el lienzo
  }
  return c;
}

/** Sólo dígitos; vacío → undefined. */
export function normalizarWhatsApp(v: string | null | undefined): string | undefined {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 6 ? d : undefined;
}

/** Usuario de Instagram desde «@usuario», «usuario» o la URL del perfil. */
export function normalizarInstagram(v: string | null | undefined): string | undefined {
  let s = String(v ?? "").trim();
  if (!s) return undefined;
  const url = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) s = url[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : undefined;
}

/**
 * La marca de la placa del negocio: nombre y monograma de su ficha, colores derivados de SU acento (todos con tinta
 * AA), y el WhatsApp / Instagram de sus ajustes.
 */
export function marcaDeLaPlaca(
  brand: Pick<TenantBrand, "name" | "monogram"> & Partial<Pick<TenantBrand, "layout">>,
  settings?: AjustesDelNegocio | null,
  acento?: string | { accent: string },
): MarcaDeLaPlaca {
  const base = (typeof acento === "string" ? acento : acento?.accent) || NEUTRO;
  const colorPrimario = asegurarContraste(base);
  const superficie = brand.layout?.palette?.surface;
  const marca: MarcaDeLaPlaca = {
    nombre: String(brand.name ?? "").trim() || "Tu negocio",
    monograma: (String(brand.monogram ?? "").trim() || String(brand.name ?? "?").trim().charAt(0) || "?").slice(0, 3),
    colorPrimario,
    colorHondo: asegurarContraste(mezclar(colorPrimario, "#000000", 0.55)), // design-lint-ignore: derivación de color en el lienzo
    colorAcento: asegurarContraste(mezclar(colorPrimario, "#ffffff", 0.55)),
    colorClaro: asegurarContraste(superficie || mezclar(colorPrimario, "#ffffff", 0.9)),
  };
  const wa = normalizarWhatsApp(settings?.whatsapp);
  const ig = normalizarInstagram(settings?.instagram);
  if (wa) marca.whatsapp = wa;
  if (ig) marca.instagram = ig;
  return marca;
}
