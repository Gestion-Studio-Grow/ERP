// ============================================================================
// LAYOUT / TOKENS DE VIDRIERA POR TENANT — LEAF CLIENT-SAFE (RFC-004-A/C/D).
// ============================================================================
//
// Tipos + helpers PUROS de la identidad de layout (hero/tipografía/paleta/orden). Vive
// SEPARADO de `branding.ts` a propósito: `branding.ts` importa `tenant-site` → Prisma/pg
// (server-only, `node:module`). Un componente `"use client"` (p. ej. `Storefront.tsx`) que
// importe VALORES de acá NO debe arrastrar Prisma al bundle del cliente. Por eso los tokens
// puros viven en este leaf sin dependencias de servidor; `branding.ts` los re-exporta para
// los callers de servidor. (Fix build: "chunking context does not support external modules
// (request: node:module)" al bundlear Storefront para el cliente.)

export type LogoPosition = "centered" | "left";

// Variante de HERO (Ola 1 — identidad genuina, no "template con otro color"):
//   - standard : dos zonas a la izquierda (el molde de hoy).
//   - editorial: centrado, serif, mucho aire (boutique — Magra).
//   - poster   : banda con lavado del acento detrás del titular (vidriera cálida — Shine).
//   - split    : titular a la izquierda + panel de acento a la derecha (retail — A Dos Manos).
export type HeroLayout = "standard" | "editorial" | "poster" | "split";

// TIPOGRAFÍA por tenant — familias YA cargadas por el layout raíz (next/font). Reasigna
// `--font-display`/`--font-body`; sin descargas nuevas.
export type FontKey = "fraunces" | "playfair" | "hanken" | "geist";
export type StorefrontTypography = {
  display: FontKey;
  body: FontKey;
  headingTransform?: "uppercase" | "none";
  headingWeight?: number;
  headingTracking?: string;
};

// PALETA de superficie por tenant — sobrescribe LOCALMENTE (inline) los tokens neutros; el
// acento sigue saliendo del preset del tenant.
export type StorefrontPalette = {
  surface?: string;
  surfaceRaised?: string;
  surfaceSunken?: string;
  textStrong?: string;
  textMuted?: string;
  line?: string;
};

// Orden de secciones de contenido de la vidriera (el "guion" del negocio). Claves faltantes
// se completan con el orden por defecto → nunca se pierde una sección.
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

// Default = el molde de hoy. Un tenant sin `layout` se ve como hasta ahora → aditivo.
export const DEFAULT_LAYOUT: TenantLayout = {
  logoPosition: "left",
  banner: null,
  hero: "standard",
};

// Layout completo del tenant (parcial declarado → completado con DEFAULT_LAYOUT). PURA.
export function resolveTenantLayout(brand: { layout?: Partial<TenantLayout> }): TenantLayout {
  return { ...DEFAULT_LAYOUT, ...(brand.layout ?? {}) };
}

// Clave de fuente → la CSS var que expone el layout raíz (next/font). Único punto de mapeo. PURA.
export const FONT_VAR: Record<FontKey, string> = {
  fraunces: "var(--font-fraunces)",
  playfair: "var(--font-spa-serif)",
  hanken: "var(--font-hanken)",
  geist: "var(--font-geist-sans)",
};

// Orden por defecto de las secciones (= el de hoy). Completa cualquier clave no listada. PURA.
export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "lines", "catalog", "ritual", "gifts", "cart", "gourmet", "providers", "reviews",
];

/** Orden final: las del tenant primero, luego las faltantes por defecto (sin duplicar). PURA. */
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
