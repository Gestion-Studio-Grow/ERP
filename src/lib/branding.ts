import { cache } from "react";
import { prisma } from "@/lib/prisma";

// ============================================================================
// Acento de MARCA por TENANT — catálogo de PRESETS sobre la base "Nocturne".
// (FUNDAMENTOS-Y-VISION: un core, marca por tenant.)
//
// El look base del ERP (Nocturne: oscuro cálido premium) es IGUAL para todos los
// tenants. Lo único que cambia por tenant es el COLOR DE ACENTO: CTAs, foco,
// estado activo del nav, chips, links. En globals.css `--accent-soft` /
// `--accent-hover` se derivan de `--accent`, así que basta definir UN color por
// tenant y se inyecta como la CSS var `--accent` en los layouts (admin y site).
// El acento NO se hardcodea en tokens ni en componentes.
//
// PRESETS: paleta curada de acentos seleccionables, cada uno con contraste AA
// sobre el fondo oscuro cálido de Nocturne (#15140F). Agregar un preset = una
// línea. Los mockups viven en `ch-estetica-mockups/` (nocturne-rosa, -celeste,
// -verde, + el ámbar original).
export const ACCENT_PRESETS = {
  petroleo: "#2c6e77", // marca CH Estética (salón)
  oxblood: "#7b2d3b", // marca Magra (carnicería)
  rosa: "#E27BA0", // frambuesa empolvado
  celeste: "#74C0DA", // celeste glaciar
  verde: "#4FBE9B", // jade / esmeralda
  ambar: "#E0A83E", // ámbar (acento original de Nocturne)
} as const;

export type AccentPreset = keyof typeof ACCENT_PRESETS;

// ASIGNACIÓN DE PRESET POR TENANT (por slug). Para cambiar el acento de un
// tenant, cambiá su preset acá — UNA sola línea, sin tocar componentes ni
// tokens. Un tenant sin entrada usa DEFAULT_PRESET.
//   ej. para que el salón use rosa:  "beauty-spa": "rosa"
const TENANT_PRESET: Record<string, AccentPreset> = {
  "beauty-spa": "petroleo",
  "magra": "oxblood",
};

// Preset por defecto para cualquier tenant sin asignación explícita.
export const DEFAULT_PRESET: AccentPreset = "petroleo";

// Back-compat: hex del acento por defecto (algún import legacy podría usarlo).
export const DEFAULT_ACCENT = ACCENT_PRESETS[DEFAULT_PRESET];

// Resuelve el HEX del acento del tenant actual. Cacheado por request
// (React.cache): varios layouts lo piden sin duplicar el lookup. Fail-open a
// propósito: el acento es cosmético, nunca debe tumbar el render; sin DB (build
// / entorno sin base) cae al preset por defecto.
//
// TODO (cuando se despliegue la migración de Neon): persistir el preset elegido
// en BusinessSettings (ej. `accentPreset: AccentPreset`) y leerlo acá con
// fallback a TENANT_PRESET → DEFAULT_PRESET. Un único punto de cambio.
export const getTenantAccent = cache(async (): Promise<string> => {
  try {
    const tenant = await prisma.tenant.findFirst({ select: { slug: true } });
    const preset = (tenant && TENANT_PRESET[tenant.slug]) || DEFAULT_PRESET;
    return ACCENT_PRESETS[preset];
  } catch {
    return ACCENT_PRESETS[DEFAULT_PRESET];
  }
});
