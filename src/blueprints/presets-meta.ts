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
// espera/comisiones (propias de servicios) → nav limpia. Espeja el set autoritativo
// de provisioning (`src/lib/operator-config` DEFAULT_MODULES/BLUEPRINT_DEFAULT_MODULES);
// acá se usa para la derivación honesta del conteo en la consola de operador (OP-2).
// Follow-up fuera de este carril: unificar ambas fuentes en una sola.
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

// "servicios" es el blueprint histórico (pre-familias): funcionalmente es el mismo
// archetipo que la familia Agenda&Servicios, así que hereda su set de módulos.
const LEGACY_MODULES: Record<string, string[]> = {
  servicios: AGENDA_MODULES,
};

/**
 * Módulos por defecto de un blueprint — para el alta 1-clic (provisioning, ADR-019)
 * y para mostrar/derivar en la consola de operador cuando `Tenant.modules` está vacío
 * (OP-2: la columna no debe leer "0" solo porque nunca se persistió). Cubre las tres
 * familias de presets, el retail/mostrador y el blueprint histórico "servicios".
 * Devuelve `[]` para blueprints sin default conocido (p. ej. "generico") — ahí "0" es
 * honesto, no un bug de datos.
 *
 * SIEMPRE devuelve ids de módulo de NAV reales (los de `MODULES`): para retail usa el
 * SET LITE POR RUBRO (`retailLiteModules`), no el vocabulario interno del blueprint
 * (stock/venta-peso/…) — así el conteo de la consola es honesto y la UI Comercio queda
 * limpia (sin "módulos" que no existen en la nav).
 */
export function defaultModulesForBlueprint(blueprintId: string | null | undefined): string[] {
  if (!blueprintId) return [];
  const preset = presetMetaFor(blueprintId)?.modules;
  if (preset) return preset;
  if (getRetailRubro(blueprintId)) return retailLiteModules(blueprintId);
  return LEGACY_MODULES[blueprintId] ?? [];
}
