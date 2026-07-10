// ============================================================================
// FICHA DE MARCA POR TENANT (RFC-004-D) — resuelta de DATOS, no de un mapa por slug.
// ============================================================================
//
// El bug real: `branding.ts` resolvía la marca de un mapa HARDCODEADO por slug cuyas claves
// (`beauty-spa/magra/shinevelas/adosmanos`) NO son los slugs sembrados
// (`estetica-demo/velas-demo/...`) → todo caía a DEFAULT_BRAND (contenido de CH). Pero el
// Tenant en la DB YA trae la ficha (`name/accentPreset/frontTheme/blueprintId`). Este módulo
// arma la BrandSheet LEYENDO EL TENANT y eligiendo un THEME PACK por `themeId` (derivado de
// `blueprintId`). Config-sobre-código: cero hardcode por slug.
//
// Detrás de `TENANT_BRAND_SHEET_ENABLED` (identity.ts). El resolver PURO (buildBrandSheet)
// es testeable sin DB; getBrandSheet añade la lectura del Tenant + cache por request.

import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";
import { getCurrentTenantId } from "@/lib/tenant";
import { invertTheme, resolveAccent, type AccentPreset, type Theme } from "@/lib/branding";
import { themeIdForBlueprint, themePack, type ThemeId, type ThemePack } from "@/lib/theme-packs";

// Datos mínimos del Tenant que alimentan la ficha (los que ya existen en el schema).
export type TenantBrandInput = {
  name: string | null;
  accentPreset: string | null;
  frontTheme: string | null;
  blueprintId: string | null;
};

export type BrandSheet = {
  name: string;
  accentPreset: AccentPreset;
  frontTheme: Theme;
  /** Tema del BACK = opuesto al front (regla front/back). */
  backTheme: Theme;
  /** blueprintId del tenant (rubro) — el front decide landing vs vidriera con esto. */
  blueprintId: string | null;
  themeId: ThemeId;
  pack: ThemePack;
};

const VALID_PRESETS = new Set<AccentPreset>(["petroleo", "oxblood", "rosa", "celeste", "verde", "ambar"]);

// Preset por defecto cuando el Tenant no declara uno: NO petróleo (CH) → un neutro celeste
// sobrio. Un tenant sin ficha nunca más hereda el acento de CH.
const NEUTRAL_PRESET: AccentPreset = "celeste";

function coercePreset(v: string | null | undefined): AccentPreset {
  const s = (v ?? "").trim().toLowerCase();
  return VALID_PRESETS.has(s as AccentPreset) ? (s as AccentPreset) : NEUTRAL_PRESET;
}

function coerceTheme(v: string | null | undefined): Theme {
  return v === "dark" ? "dark" : "light";
}

/** Arma la ficha a partir de los datos del Tenant. PURA (sin DB). RFC-004-D. */
export function buildBrandSheet(t: TenantBrandInput): BrandSheet {
  const accentPreset = coercePreset(t.accentPreset);
  const frontTheme = coerceTheme(t.frontTheme);
  const themeId = themeIdForBlueprint(t.blueprintId);
  return {
    name: (t.name ?? "").trim() || "Mi negocio",
    accentPreset,
    frontTheme,
    backTheme: invertTheme(frontTheme),
    blueprintId: t.blueprintId ?? null,
    themeId,
    pack: themePack(themeId),
  };
}

/** Acento resuelto para una superficie de la ficha (hex + on-accent) según su tema. */
export function brandSheetAccent(sheet: BrandSheet, theme: Theme) {
  return resolveAccent(sheet.accentPreset, theme);
}

/**
 * Ficha del tenant actual, leída de la DB (cliente BASE, fuera de RLS, como el resto de la
 * resolución de tenant). Cacheada por request. Fail-open: sin DB / sin tenant → ficha neutra
 * (base GSG), NUNCA CH. NO cambia la resolución de tenant (solo la piel).
 */
export const getBrandSheet = cache(async (): Promise<BrandSheet> => {
  try {
    const id = await getCurrentTenantId();
    const t = await basePrisma.tenant.findUnique({
      where: { id },
      select: { name: true, accentPreset: true, frontTheme: true, blueprintId: true },
    });
    return buildBrandSheet(t ?? { name: null, accentPreset: null, frontTheme: null, blueprintId: null });
  } catch {
    return buildBrandSheet({ name: null, accentPreset: null, frontTheme: null, blueprintId: null });
  }
});
