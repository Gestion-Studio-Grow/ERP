// ─────────────────────────────────────────────────────────────────────────────
// CONSULTOR de la demo — el paso que corre ANTES de armar el backoffice.
//
// Secuencia no negociable del dueño (plan-acceso-sandbox-sin-password.md §7):
// un agente CONSULTOR recomienda, según el rubro/negocio del prospecto, qué
// necesita para su gestión óptima (qué familia de negocio es, qué módulos/
// pantallas, qué reportes, cuál es la pantalla primaria). Esa recomendación
// DETERMINA qué fixtures arma `demo-sandbox.ts` — es ENTRADA del backoffice, no
// un adorno posterior. El v1 hacía lo inverso (backoffice hardcodeado a un rubro).
//
// Reusa la taxonomía YA ratificada (docs/preventa/preset-contract.md §3): las
// mismas familias y el mismo `resolveBlueprint()` de `src/blueprints/` — NO
// inventa una segunda taxonomía de rubros. Cero IA todavía: es un mapeo
// determinista rubro→blueprint→familia→config. El punto de este incremento es que
// el PASO EXISTA y el backoffice DEPENDA de su salida, no que sea sofisticado.
//
// Puro y testeable: sin Prisma, sin secretos. La única lectura de entorno vive en
// `activeDemoRecommendation()` (el rubro del deploy de demo), aislada a propósito.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveBlueprint } from "@/blueprints";
import { AGENDA_RUBRO_IDS } from "@/blueprints/agenda/rubros";
import { RETAIL_RUBRO_IDS } from "@/blueprints/retail/rubros";
import { OFICIOS_RUBRO_IDS } from "@/blueprints/oficios/rubros";
import { GASTRO_RUBRO_IDS } from "@/blueprints/gastronomia/rubros";
import { presetMetaFor } from "@/blueprints/presets-meta";

// Familias de negocio de la tabla ratificada (preset-contract.md §3). NO es una
// taxonomía nueva: es el agrupamiento por-familia de los blueprints existentes.
export type DemoFamily =
  | "agenda-servicios"
  | "retail-mostrador"
  | "gastronomia"
  | "servicios-oficios"
  | "generico";

// Qué vende el negocio: turnos de servicio vs. productos de mostrador. Dirige la
// FORMA de las fixtures (agenda de turnos vs. ventas de catálogo).
export type DemoItemKind = "servicio" | "producto";

// La recomendación del consultor. Es lo que el backoffice consume para decidir
// qué mostrar y con qué datos ficticios poblarse.
export interface ConsultorRecommendation {
  /** Rubro crudo que se consultó (lo que declaró el prospecto). */
  rubro: string;
  /** Blueprint resuelto (`src/blueprints`, vía `resolveBlueprint`). */
  blueprintId: string;
  blueprintLabel: string;
  /** Familia de negocio (taxonomía de preset-contract.md §3). */
  family: DemoFamily;
  familyLabel: string;
  /** false = el rubro no matcheó ningún vertical y cayó al comodín genérico. */
  matchedRubro: boolean;
  /** Módulos/pantallas que el backoffice debe ofrecer (set por familia). */
  modules: string[];
  /** Reportes que el Panel del Dueño debe destacar (ids, orden de relevancia). */
  reports: string[];
  /** Pantalla primaria del backoffice para este negocio. */
  primaryScreen: "agenda" | "vidriera";
  /** Turnos de servicio vs. productos de mostrador — dirige las fixtures. */
  itemKind: DemoItemKind;
  /** Branding sugerido para el backoffice de la demo (src/lib/branding.ts). */
  accent: string;
  theme: "light" | "dark";
}

// Config por familia. Módulos y reportes salen de preset-contract.md §3 (columna
// "Módulos" y las escenas transversales caja/factura/dueño/cierre). Fuente única:
// si esa tabla cambia, cambia acá, no en `demo-sandbox.ts`.
interface FamilyInfo {
  label: string;
  modules: string[];
  reports: string[];
  primaryScreen: "agenda" | "vidriera";
  itemKind: DemoItemKind;
  defaultAccent: string;
  defaultTheme: "light" | "dark";
}

const FAMILY_INFO: Record<DemoFamily, FamilyInfo> = {
  "agenda-servicios": {
    label: "Agenda & Servicios",
    modules: ["agenda", "catalog", "clients", "waitlist", "reminders", "reports"],
    reports: ["ingresos", "porProfesional", "porServicio", "panelDueno"],
    primaryScreen: "agenda",
    itemKind: "servicio",
    defaultAccent: "rosa",
    defaultTheme: "light",
  },
  "retail-mostrador": {
    label: "Retail / Mostrador",
    modules: ["pos", "catalog", "clients", "reports", "arca", "inventario"],
    reports: ["ingresos", "porProducto", "panelDueno"],
    primaryScreen: "vidriera",
    itemKind: "producto",
    defaultAccent: "oxblood",
    defaultTheme: "light",
  },
  gastronomia: {
    label: "Gastronomía",
    modules: ["pos", "catalog", "clients", "reports", "arca"],
    reports: ["ingresos", "porProducto", "panelDueno"],
    primaryScreen: "vidriera",
    itemKind: "producto",
    defaultAccent: "ambar",
    defaultTheme: "dark",
  },
  "servicios-oficios": {
    label: "Servicios & Oficios",
    modules: ["agenda", "catalog", "clients", "reminders", "reports", "arca"],
    reports: ["ingresos", "porProfesional", "porServicio", "panelDueno"],
    primaryScreen: "agenda",
    itemKind: "servicio",
    defaultAccent: "celeste",
    defaultTheme: "light",
  },
  generico: {
    // Comodín honesto (preset-contract.md §3, última fila): set base, sin agenda
    // ni POS específicos. Se justifica que cayó al genérico (matchedRubro=false).
    label: "Genérico",
    modules: ["catalog", "clients", "caja", "reports"],
    reports: ["ingresos", "panelDueno"],
    primaryScreen: "vidriera",
    itemKind: "producto",
    defaultAccent: "petroleo",
    defaultTheme: "light",
  },
};

// Blueprint → familia. Los ids viven en cada familia de `src/blueprints/`; acá
// solo se los agrupa. `servicios` (blueprint por defecto del ERP) y todo rubro de
// agenda caen en Agenda&Servicios; `generico` (comodín) en la familia genérica.
export function familyForBlueprint(blueprintId: string): DemoFamily {
  if (RETAIL_RUBRO_IDS.includes(blueprintId)) return "retail-mostrador";
  if (GASTRO_RUBRO_IDS.includes(blueprintId)) return "gastronomia";
  if (OFICIOS_RUBRO_IDS.includes(blueprintId)) return "servicios-oficios";
  if (AGENDA_RUBRO_IDS.includes(blueprintId) || blueprintId === "servicios") {
    return "agenda-servicios";
  }
  return "generico";
}

/**
 * El consultor: dado el rubro libre del prospecto, produce la recomendación que
 * determina el backoffice. Determinista (cero IA): `resolveBlueprint` mapea el
 * rubro a un blueprint modelado (o al comodín), y la familia decide módulos,
 * reportes y forma de datos.
 */
export function recommendForRubro(rubro: string): ConsultorRecommendation {
  const match = resolveBlueprint(rubro);
  const family = familyForBlueprint(match.blueprintId);
  const info = FAMILY_INFO[family];
  // El acento/tema del rubro específico (agenda/oficios/gastro) manda si existe;
  // si no (retail no declara acento por rubro, o comodín), cae al de la familia.
  const meta = presetMetaFor(match.blueprintId);
  return {
    rubro,
    blueprintId: match.blueprintId,
    blueprintLabel: match.blueprint.label,
    family,
    familyLabel: info.label,
    matchedRubro: match.matched,
    modules: info.modules,
    reports: info.reports,
    primaryScreen: info.primaryScreen,
    itemKind: info.itemKind,
    accent: meta?.accent ?? info.defaultAccent,
    theme: meta?.theme ?? info.defaultTheme,
  };
}

// Rubro del deploy de demo. Un sitio de demo declara `DEMO_RUBRO` (junto a
// `DEMO_MODE_ENABLED=true` y `FORCE_TENANT_SLUG=demo-*`, ver el plan §2.1). Si no
// se declara, cae al rubro PILOTO (estética / familia Agenda&Servicios) — así el
// comportamiento del v1 se preserva sin configuración extra.
export const DEFAULT_DEMO_RUBRO = "estetica";

export function activeDemoRubro(): string {
  const raw = process.env.DEMO_RUBRO?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_DEMO_RUBRO;
}

/** La recomendación del deploy de demo activo (leída del entorno una vez por uso). */
export function activeDemoRecommendation(): ConsultorRecommendation {
  return recommendForRubro(activeDemoRubro());
}
