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

// ESTRUCTURA de la vidriera por tenant (RFC-004-A §3, "romper el molde único").
// El Sesgo A del diagnóstico: la estructura estaba hardcodeada (mismo header/hero para
// todos → "todas las webs salen iguales"). Estos campos declaran la IDENTIDAD DE LAYOUT
// real de cada negocio, no un molde:
//   - `logoPosition`: el logo va CENTRADO (marca-crest, tipo boutique: Magra, Shine) o a
//     la IZQUIERDA con nav al lado (tipo tienda/retail clásico: A Dos Manos, CH).
//   - `banner`: texto del anuncio superior, o `null` si el negocio NO usa banner (el Magra
//     real no tiene banner; ponérselo era exactamente el sesgo que marcó el dueño).
//   - `hero`: "editorial" (centrado, aire, foco en la marca) vs "standard" (a la izquierda,
//     foco en el CTA/producto).
// La vidriera solo los aplica con `TENANT_FIDELITY_ENABLED` ON (ver src/lib/identity.ts);
// con el flag OFF renderiza el molde de hoy. `resolveTenantLayout` completa los defaults.
export type LogoPosition = "centered" | "left";
// Variante de HERO (Ola 1 — identidad genuina, no "template con otro color"):
//   - standard : dos zonas a la izquierda (el molde de hoy).
//   - editorial: centrado, serif, mucho aire (boutique — Magra).
//   - poster   : banda con lavado del acento detrás del titular (vidriera cálida — Shine).
//   - split    : titular a la izquierda + panel de acento a la derecha (retail — A Dos Manos).
export type HeroLayout = "standard" | "editorial" | "poster" | "split";

// TIPOGRAFÍA por tenant — se elige entre las familias YA cargadas (next/font en el layout
// raíz): sin descargas nuevas, solo se reasignan `--font-display`/`--font-body`. Da voz
// propia a cada vidriera (serif elegante ≠ grotesca deportiva) en vez de la serif de CH.
export type FontKey = "fraunces" | "playfair" | "hanken" | "geist";
export type StorefrontTypography = {
  display: FontKey;
  body: FontKey;
  headingTransform?: "uppercase" | "none";
  headingWeight?: number;
  headingTracking?: string;
};

// PALETA de superficie por tenant — sobrescribe LOCALMENTE (inline, solo en la vidriera)
// los tokens neutros para que cada negocio tenga su "papel" propio (bone cálido de la
// carnicería ≠ blush de las velas ≠ slate frío del pádel). El ACENTO sigue saliendo del
// preset del tenant; esto es el fondo sobre el que ese acento se monta.
export type StorefrontPalette = {
  surface?: string;
  surfaceRaised?: string;
  surfaceSunken?: string;
  textStrong?: string;
  textMuted?: string;
  line?: string;
};

// Orden de las secciones de contenido de la vidriera (el "guion" del negocio): una
// carnicería cuenta primero su historia; una tienda de pádel muestra primero el catálogo.
// Claves faltantes se completan con el orden por defecto → nunca se pierde una sección.
export type SectionKey =
  | "lines" | "catalog" | "ritual" | "gifts" | "cart" | "gourmet" | "providers" | "reviews";

export type TenantLayout = {
  logoPosition: LogoPosition;
  banner: string | null;
  hero: HeroLayout;
  typography?: StorefrontTypography;
  palette?: StorefrontPalette;
  sectionOrder?: SectionKey[];
};

// Default = el molde de hoy (logo a la izquierda, sin banner, hero estándar, sin tipografía
// ni paleta ni reorden propios). Un tenant sin `layout` declarado se ve como hasta ahora →
// aditivo, sin regresiones. Con `TENANT_FIDELITY_ENABLED` OFF, la vidriera lo ignora entero.
export const DEFAULT_LAYOUT: TenantLayout = {
  logoPosition: "left",
  banner: null,
  hero: "standard",
};

// Branding declarado por tenant. `frontTheme` es el tema de su vidriera; el back
// se deriva con la regla. `monogram` es el logo textual de respaldo; `logoAsset` es
// el LOGO REAL del tenant (URL/data-URI de SVG/PNG) cuando existe — la fidelidad de
// marca pasa de "monograma sobre el acento" a "el logo del cliente". `layout` declara
// su estructura real de vidriera (ver TenantLayout); ausente → DEFAULT_LAYOUT.
export type TenantBrand = {
  name: string;
  monogram: string;
  preset: AccentPreset;
  frontTheme: Theme;
  /** Logo real del tenant (URL o data-URI). Ausente → se usa el monograma sobre el acento. */
  logoAsset?: string;
  /** Estructura de vidriera real (parcial; se completa con DEFAULT_LAYOUT). */
  layout?: Partial<TenantLayout>;
};

// Asignación por tenant (por slug). Cambiar el acento o el tema de un tenant es
// una línea acá — sin tocar componentes ni tokens.
// LAYOUT DEMO POR TENANT (RFC-004-A §3): seteado a mano para que cada vidriera se vea
// DISTINTA entre sí y de CH — el material real entra por el preset-IA/provisioning
// (RFC-004-B) o se persiste en DB (§C, Gate 2). Cada uno espeja la identidad real del
// negocio, no un molde:
const TENANTS: Record<string, TenantBrand> = {
  // CH Estética — salón/spa: logo a la izquierda + nav, banner de anuncio (su sitio real
  // lo usa), hero estándar. El molde "de siempre" ES, correctamente, el de CH.
  "beauty-spa": {
    name: "CH Estética", monogram: "CH", preset: "petroleo", frontTheme: "light",
    layout: { logoPosition: "left", banner: "Reservá online · La Alameda, Canning", hero: "standard" },
  },
  // Magra — carnicería boutique premium: crest CENTRADO, SIN banner, hero EDITORIAL, serif
  // Playfair de alto contraste sobre papel bone cálido. Exactamente lo que pidió el dueño
  // (logo al medio, sin banner) y una voz gastronómica-editorial que NO es la de CH.
  "magra": {
    name: "Magra", monogram: "M", preset: "oxblood", frontTheme: "light",
    layout: {
      logoPosition: "centered", banner: null, hero: "editorial",
      typography: { display: "playfair", body: "geist", headingWeight: 600, headingTracking: "-0.02em" },
      palette: { surface: "#f7f3ee", surfaceRaised: "#fffdfa", surfaceSunken: "#efe8df", textStrong: "#1f1a17", textMuted: "#6f665e", line: "#e6ddd2" },
      // Cuenta primero la historia del producto (envasados) y luego vende.
      sectionOrder: ["lines", "catalog", "cart", "gourmet", "providers", "reviews"],
    },
  },
  // Shine — velas & deco: boutique experiencial. Crest CENTRADO, banner de envío gratis
  // (umbral real $25.000), hero POSTER con lavado cálido del ámbar, serif Fraunces suave
  // sobre papel blush. La experiencia (ritual) va ARRIBA del catálogo.
  "shinevelas": {
    name: "Shine", monogram: "S", preset: "ambar", frontTheme: "light",
    layout: {
      logoPosition: "centered", banner: "Envío gratis desde $25.000 · CABA y GBA", hero: "poster",
      typography: { display: "fraunces", body: "hanken", headingWeight: 500 },
      palette: { surface: "#f6f1f0", surfaceRaised: "#fffafa", surfaceSunken: "#efe6e6", textStrong: "#241d20", textMuted: "#726167", line: "#e8dcdd" },
      sectionOrder: ["ritual", "lines", "catalog", "gifts", "cart", "gourmet", "reviews"],
    },
  },
  // A Dos Manos — tienda de pádel: retail. Logo a la IZQUIERDA + nav, sin banner, hero SPLIT
  // (titular + panel de acento), grotesca Hanken en MAYÚSCULAS sobre slate frío. El catálogo
  // LIDERA (product-first). Se ve "tienda deportiva", ni boutique ni spa.
  "adosmanos": {
    name: "A Dos Manos", monogram: "AM", preset: "verde", frontTheme: "light",
    layout: {
      logoPosition: "left", banner: null, hero: "split",
      typography: { display: "hanken", body: "geist", headingTransform: "uppercase", headingWeight: 800, headingTracking: "-0.01em" },
      palette: { surface: "#eef1f3", surfaceRaised: "#ffffff", surfaceSunken: "#e2e7ea", textStrong: "#141a1e", textMuted: "#5c676e", line: "#d7dee2" },
      sectionOrder: ["catalog", "cart", "lines", "gourmet", "providers", "reviews"],
    },
  },
};

// Layout completo del tenant (parcial declarado → completado con DEFAULT_LAYOUT). PURA.
export function resolveTenantLayout(brand: TenantBrand): TenantLayout {
  return { ...DEFAULT_LAYOUT, ...(brand.layout ?? {}) };
}

// Clave de fuente → la CSS var que expone el layout raíz (next/font). Único punto de
// mapeo, para que branding.ts declare identidad sin conocer los nombres de las vars. PURA.
export const FONT_VAR: Record<FontKey, string> = {
  fraunces: "var(--font-fraunces)",
  playfair: "var(--font-spa-serif)",
  hanken: "var(--font-hanken)",
  geist: "var(--font-geist-sans)",
};

// Orden por defecto de las secciones de la vidriera (= el de hoy). Se usa para completar
// cualquier clave que un tenant no liste en su `sectionOrder` → nunca se pierde contenido.
export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "lines", "catalog", "ritual", "gifts", "cart", "gourmet", "providers", "reviews",
];

/** Orden final de secciones: las del tenant primero, luego las faltantes en su orden por
 *  defecto (sin duplicar). `null`/vacío → el orden por defecto tal cual. PURA. */
export function resolveSectionOrder(order: SectionKey[] | null | undefined): SectionKey[] {
  const seen = new Set<SectionKey>();
  const out: SectionKey[] = [];
  for (const k of [...(order ?? []), ...DEFAULT_SECTION_ORDER]) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// DEFAULT NEUTRO (RFC-004-D): un tenant SIN ficha ya NO hereda la marca de CH. Nombre
// genérico + acento neutro (celeste, NO el petróleo de CH). beauty-spa/CH tiene su entrada
// propia en TENANTS, así que este cambio no lo toca. Cierra el "todo cae a CH" del branding.
const DEFAULT_BRAND: TenantBrand = {
  name: "Mi negocio",
  monogram: "•",
  preset: "celeste",
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
