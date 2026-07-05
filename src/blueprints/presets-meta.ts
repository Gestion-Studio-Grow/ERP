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

export interface PresetMeta {
  /** Módulos/pantallas activos por defecto en el alta (ver src/lib/operator-config MODULES). */
  modules: string[];
  /** Preset de acento sugerido (src/lib/branding.ts). */
  accent: string;
  /** Tema sugerido de la vidriera. */
  theme: "light" | "dark";
}

// Sets de módulos por familia (mismos ids que MODULES en operator-config).
const AGENDA_MODULES = ["agenda", "catalog", "clients", "waitlist", "reminders", "reports"];
const OFICIOS_MODULES = ["agenda", "catalog", "clients", "reminders", "reports", "arca"];
const GASTRO_MODULES = ["pos", "catalog", "clients", "reports", "arca"];

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
