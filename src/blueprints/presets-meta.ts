// Metadata liviana de los presets por rubro (módulos por defecto + acento sugerido),
// para el control-plane (alta 1-clic). Importa SÓLO los datos de rubros (arrays puros,
// sin los seeders ni closures de DB), así el bundle del cliente que muestra el alta no
// arrastra código de servidor.
//
// Fuente única del acento/tema: cada rubro lo declara en su `rubros.ts`. Los módulos
// por defecto se definen por FAMILIA (todos los rubros de una familia usan el mismo set
// de pantallas), acá.

import { AGENDA_RUBROS } from "./agenda/rubros";
import { OFICIOS_RUBROS } from "./oficios/rubros";
import { GASTRO_RUBROS } from "./gastronomia/rubros";
import { getRetailRubro } from "./retail/rubros";

export interface PresetMeta {
  /** Módulos/pantallas activos por defecto en el alta (ver src/lib/operator-config MODULES). */
  modules: string[];
  /** Preset de acento sugerido (src/lib/branding.ts). */
  accent: string;
  /** Tema sugerido de la vidriera. */
  theme: "light" | "dark";
}

// ============================================================================
// SET LITE POR RUBRO — qué módulos de NAV quedan ON por defecto en un Comercio
// (perfil lite) de cada rubro. IDs REALES de módulo (los de `MODULES` en
// operator-config: agenda·pos·catalog·clients·waitlist·reminders·reports·
// commissions·arca·mercadopago), NUNCA el vocabulario interno del blueprint retail
// (stock/venta-peso/venta-unidad/proveedores/cuenta-corriente, que NO son módulos de
// nav y ensuciaban la UI). Curado para que el Comercio de cada rubro muestre SOLO lo
// que usa — la vidriera del backoffice queda limpia y vendible.
// ============================================================================

// Sets de módulos por familia (mismos ids que MODULES en operator-config).
// Servicios/agenda: turnos + su cola de espera + recordatorios. SIN pos (no es
// mostrador). Es el Comercio de CH Estética.
const AGENDA_MODULES = ["agenda", "catalog", "clients", "waitlist", "reminders", "reports"];
const OFICIOS_MODULES = ["agenda", "catalog", "clients", "reminders", "reports", "arca"];
const GASTRO_MODULES = ["pos", "catalog", "clients", "reports", "arca"];

// Retail / Mostrador: el Comercio de una tienda (Magra, Shine, A Dos Manos). Vende
// por mostrador (pos), tiene catálogo, clientes y reportes. SIN agenda/lista de
// espera/comisiones (propias de servicios) → nav limpia. Es parte de la FUENTE ÚNICA de
// defaults por blueprint (FU1 unificado: operator-config re-exporta la función de acá).
const RETAIL_LITE_MODULES = ["pos", "catalog", "clients", "reports"];
// Nuance por rubro: la carnicería factura de mostrador (fiscal común en el retail AR)
// → suma ARCA, igual que el set autoritativo de operator-config para `carniceria`. El
// resto del retail arranca sin ARCA (se enciende cuando el negocio lo pide).
const RETAIL_LITE_MODULES_BY_RUBRO: Record<string, string[]> = {
  carniceria: [...RETAIL_LITE_MODULES, "arca"],
};
function retailLiteModules(rubroId: string): string[] {
  return RETAIL_LITE_MODULES_BY_RUBRO[rubroId] ?? RETAIL_LITE_MODULES;
}

export const PRESET_META: Record<string, PresetMeta> = {
  ...Object.fromEntries(
    AGENDA_RUBROS.map((r) => [r.id, { modules: AGENDA_MODULES, accent: r.suggestedAccent, theme: r.suggestedTheme }]),
  ),
  ...Object.fromEntries(
    OFICIOS_RUBROS.map((r) => [r.id, { modules: OFICIOS_MODULES, accent: r.suggestedAccent, theme: r.suggestedTheme }]),
  ),
  ...Object.fromEntries(
    GASTRO_RUBROS.map((r) => [r.id, { modules: GASTRO_MODULES, accent: r.suggestedAccent, theme: r.suggestedTheme }]),
  ),
};

export function presetMetaFor(blueprintId: string | null | undefined): PresetMeta | null {
  if (!blueprintId) return null;
  return PRESET_META[blueprintId] ?? null;
}

// ============================================================================
// FUENTE DE VERDAD ÚNICA de "qué módulos trae un blueprint por defecto" (FU1, Concepto A).
// ============================================================================
//
// Antes había DOS definiciones de `defaultModulesForBlueprint` con drift real (esta y la de
// `src/lib/operator-config.ts`): distinto orden de lookup y distinto fallback → el mismo
// blueprint recibía sets distintos según qué camino resolviera. Se unifican ACÁ; operator-config
// ahora RE-EXPORTA esta función (única implementación, único fallback). Ver
// docs/estrategia/propuestas-unificacion-blueprint-modules.md.

// Fallback ÚNICO y EXPLÍCITO para blueprint desconocido / null: el set base funcional de un
// mostrador (vender + catálogo + clientes + reportes). Se elige ESTE, no `[]`: un tenant sin
// blueprint modelado igual necesita un panel que OPERE (el alta persiste estos módulos y la nav
// tiene con qué renderizar). `[]` dejaría la UI vacía — un tenant "roto" en vez de uno mínimo.
const BASE_MODULES = ["catalog", "clients", "pos", "reports"];

// Overrides explícitos por blueprint que NO salen de una familia de presets ni del retail:
//   - "servicios": el histórico (spa). Set de agenda + `commissions` (liquida a profesionales,
//     propio del rubro servicios — antes solo lo tenía la versión de operator-config).
//   - "generico": el comodín, con un poco de todo (agenda + mostrador), como asignaba el alta.
// Absorbe el viejo `BLUEPRINT_DEFAULT_MODULES` de operator-config sin drift.
const EXPLICIT_BLUEPRINT_MODULES: Record<string, string[]> = {
  servicios: [...AGENDA_MODULES, "commissions"],
  generico: ["catalog", "clients", "pos", "agenda", "reports"],
  // Producto C de la suite (ADR-076): tenant liviano SOLO facturación + receptores.
  facturita: ["arca", "clients"],
};

/**
 * Módulos por defecto de un blueprint — FUENTE ÚNICA (provisioning ADR-019 + consola OP-2).
 * Orden de resolución: override explícito → familia de presets → retail (set lite por rubro) →
 * **fallback base** (`BASE_MODULES`). SIEMPRE devuelve ids de módulo de NAV reales (los de
 * `MODULES`); para retail usa el SET LITE POR RUBRO (`retailLiteModules`), nunca el vocabulario
 * interno del blueprint (stock/venta-peso/…) → conteo honesto y UI Comercio limpia.
 *
 * Blueprint desconocido, no modelado o `null`/`undefined` → `BASE_MODULES` (nunca `[]`): la UI
 * jamás queda vacía; el peor caso es un tenant mínimo funcional, no uno roto.
 */
export function defaultModulesForBlueprint(blueprintId: string | null | undefined): string[] {
  if (blueprintId) {
    const explicit = EXPLICIT_BLUEPRINT_MODULES[blueprintId];
    if (explicit) return explicit;
    const preset = presetMetaFor(blueprintId)?.modules;
    if (preset) return preset;
    if (getRetailRubro(blueprintId)) return retailLiteModules(blueprintId);
  }
  return BASE_MODULES;
}
