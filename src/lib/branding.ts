import { cache } from "react";
import { getCurrentTenantSlug } from "@/lib/tenant-site";

// ============================================================================
// BRANDING POR TENANT + REGLA DE TEMAS FRONT/BACK (design system)
// (FUNDAMENTOS-Y-VISION: un core, marca por tenant.)
//
// REGLA DEL SISTEMA (vale para CUALQUIER tenant, no hardcode):
//   El FRONT (vidriera / sitio público) y el BACK (backoffice / admin) usan
//   temas de luminosidad OPUESTA. Del branding del tenant sale el tema del
//   FRONT; el BACK toma automáticamente el inverso (claro↔oscuro). Ambos temas
//   son de la familia base (Nocturne, cálida): comparten paleta y acento del
//   tenant; solo cambia la luminosidad. Ver globals.css ([data-theme]).
//
// El acento NO se hardcodea en componentes: se resuelve acá y se inyecta como
// las CSS vars `--accent` y `--text-on-accent` en el contenedor de cada layout,
// junto con `data-theme`. `--accent-soft`/`--accent-hover` se derivan en
// globals.css según el tema.

export type Theme = "light" | "dark";

// Inversión de luminosidad — el corazón de la regla front/back.
export const invertTheme = (t: Theme): Theme => (t === "light" ? "dark" : "light");

// PRESETS de acento. Por cada hue del tenant, un tono afinado para fondo CLARO y
// otro para fondo OSCURO (mismo hue, distinta luminosidad) + el texto sobre el
// acento (AA). Así el acento del tenant conserva identidad y contraste AA tanto
// en el front como en el back, que van en luminosidades opuestas.
type PresetTones = { light: string; dark: string; onLight: string; onDark: string };
export const ACCENT_PRESETS = {
  petroleo: { light: "#2c6e77", dark: "#5fb0bc", onLight: "#ffffff", onDark: "#0b2226" }, // salón CH
  oxblood: { light: "#7b2d3b", dark: "#d26a7d", onLight: "#ffffff", onDark: "#2a0d13" }, // Magra
  rosa: { light: "#b14a6b", dark: "#e27ba0", onLight: "#ffffff", onDark: "#20101a" },
  celeste: { light: "#2e7c97", dark: "#74c0da", onLight: "#ffffff", onDark: "#08181d" },
  verde: { light: "#2f7d66", dark: "#4fbe9b", onLight: "#ffffff", onDark: "#06201a" },
  ambar: { light: "#9a6a1f", dark: "#e0a83e", onLight: "#ffffff", onDark: "#1b1508" },
} satisfies Record<string, PresetTones>;

export type AccentPreset = keyof typeof ACCENT_PRESETS;

// Branding declarado por tenant. `frontTheme` es el tema de su vidriera; el back
// se deriva con la regla. `monogram` es el logo (reemplazable por un SVG/asset
// real más adelante; hoy monograma sobre el acento, con contraste AA garantizado
// por el par accent/onAccent del preset).
export type TenantBrand = {
  name: string;
  monogram: string;
  preset: AccentPreset;
  frontTheme: Theme;
};

// Asignación por tenant (por slug). Cambiar el acento o el tema de un tenant es
// una línea acá — sin tocar componentes ni tokens.
const TENANTS: Record<string, TenantBrand> = {
  // Salón: vidriera clara → admin oscuro (Nocturne). Acento petróleo de marca.
  "beauty-spa": { name: "CH Estética", monogram: "CH", preset: "petroleo", frontTheme: "light" },
  // Magra (carnicería): vidriera clara → admin oscuro. Acento oxblood de marca.
  "magra": { name: "Magra", monogram: "M", preset: "oxblood", frontTheme: "light" },
  // Shine (velas de soja): vidriera clara cálida → admin oscuro. Acento ámbar/dorado,
  // el "shine" de una llama de vela. Ver src/tenants/storefront.ts (copy) y rubro `velas`.
  "shinevelas": { name: "Shine", monogram: "S", preset: "ambar", frontTheme: "light" },
  // A Dos Manos (tienda de pádel): vidriera clara → admin oscuro. Acento verde cancha.
  "adosmanos": { name: "A Dos Manos", monogram: "AM", preset: "verde", frontTheme: "light" },
};

const DEFAULT_BRAND: TenantBrand = {
  name: "ERP",
  monogram: "◆",
  preset: "petroleo",
  frontTheme: "light",
};

// Lookup PURO (sin DB) — separado para poder testear la asignación slug→marca sin
// mockear Prisma/el request. `null`/slug desconocido → DEFAULT_BRAND.
export function brandForSlug(slug: string | null): TenantBrand {
  return (slug && TENANTS[slug]) || DEFAULT_BRAND;
}

// Acento resuelto (hex + texto-sobre-acento) para una superficie según SU tema.
export function resolveAccent(preset: AccentPreset, theme: Theme) {
  const p = ACCENT_PRESETS[preset] ?? ACCENT_PRESETS[DEFAULT_BRAND.preset];
  return theme === "dark"
    ? { accent: p.dark, onAccent: p.onDark }
    : { accent: p.light, onAccent: p.onLight };
}

// Branding del tenant actual. Cacheado por request (React.cache); fail-open a
// propósito (el branding es cosmético, nunca debe tumbar el render). Sin DB
// (build / entorno sin base) cae al brand por defecto.
//
// Resuelve por el TENANT ACTUAL del request (`getCurrentTenantSlug`, host/subdominio/
// TENANT_HOST_MAP/FORCE_TENANT_SLUG-aware) — antes usaba `tenant.findFirst()` sin
// `where`, que devolvía siempre la MISMA fila (la más vieja de la tabla, típicamente
// CH) sin importar qué tenant estaba sirviendo el request. Esa fue la causa de J-2:
// TODOS los dominios (magra-erp, adosmanos-erp, etc.) mostraban la marca de CH en
// `/admin/login` y en el resto del backoffice.
//
// TODO (cuando se despliegue la migración de Neon): persistir por tenant en
// BusinessSettings (accentPreset, frontTheme, logo) y leerlo acá con fallback a
// este mapa. Un único punto de cambio.
export const getTenantBrand = cache(async (): Promise<TenantBrand> => {
  try {
    return brandForSlug(await getCurrentTenantSlug());
  } catch {
    return DEFAULT_BRAND;
  }
});

// Helpers de tema por superficie (aplican la regla).
export const getFrontTheme = async (): Promise<Theme> => (await getTenantBrand()).frontTheme;
export const getBackTheme = async (): Promise<Theme> => invertTheme((await getTenantBrand()).frontTheme);

// Back-compat: hex del acento en el tema del front (algún import legacy).
export const getTenantAccent = cache(async (): Promise<string> => {
  const b = await getTenantBrand();
  return resolveAccent(b.preset, b.frontTheme).accent;
});
export const DEFAULT_ACCENT = ACCENT_PRESETS[DEFAULT_BRAND.preset].light;

// Favicon POR TENANT como data-URI SVG: el glifo de marca (monograma o iniciales)
// en el acento del tenant sobre una teja hueso redondeada. Único builder para que
// el ícono de la pestaña sea idéntico en toda la app (layout raíz → landing,
// /reserva, /admin) y en la vidriera (/tienda), sin que un tenant herede el "CH"
// de otro. Antes el layout raíz hardcodeaba el ícono "CH" para todas las rutas.
export function tenantFaviconDataUri(glyph: string, accent: string): string {
  const g = (glyph || "•").trim().slice(0, 3);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
    `<rect width='64' height='64' rx='12' fill='#faf7f2'/>` +
    `<text x='32' y='44' font-family='Georgia,serif' font-size='30' font-weight='500' fill='${accent}' text-anchor='middle'>${g}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
