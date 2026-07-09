// Catálogo del control-plane (ADR-021): MÓDULOS activables, PLANES y presets, más
// los defaults por blueprint. DATO PURO, sin dependencias de servidor: lo importan
// tanto los Server Actions del operador como los componentes de la consola.
//
// Estos módulos son el eje "por-tenant" que hoy falta (ONBOARDING-TENANT §2.3): el
// tenant guarda su lista de módulos activos (`Tenant.modules`), y la idea es que el
// nav del backoffice los respete además del rol. La consola de operador es donde se
// encienden/apagan.

import { presetMetaFor } from "@/blueprints/presets-meta";
import { DESCRIPTORES_CATALOGO } from "@/modules/catalog";

// Un módulo del producto que se puede activar por tenant. `capability` lo ata al
// RBAC del backoffice (capabilities.ts); `plugin` marca los que son integraciones.
export interface ModuleDef {
  id: string;
  label: string;
  description: string;
  /** true si es una integración externa (Plugin, ADR-002/020) y no una capability nativa. */
  plugin?: boolean;
}

// FUENTE ÚNICA: la lista de la consola se DERIVA del catálogo canónico de módulos
// (`src/modules`, ADR-054/055), no es una 2ª lista a mano. Antes era una copia paralela con
// drift (le faltaba `reviews` y los módulos Empresa de ADR-060). Proyección directa del
// `ModuleDescriptor` → `ModuleDef` (label=nombre, description=descripcion, plugin=kind).
// `DESCRIPTORES_CATALOGO` es dato PURO (client-safe): no arrastra Prisma/red/React.
export const MODULES: ModuleDef[] = DESCRIPTORES_CATALOGO.map((d) => ({
  id: d.id,
  label: d.nombre,
  description: d.descripcion,
  ...(d.kind === "plugin" ? { plugin: true } : {}),
}));

export const MODULE_IDS = MODULES.map((m) => m.id);

export function isModuleId(id: string): boolean {
  return MODULE_IDS.includes(id);
}

// Módulos que enciende cada blueprint por defecto en el alta. FUENTE ÚNICA (FU1, Concepto A):
// la implementación vive en `@/blueprints/presets-meta` y se RE-EXPORTA acá para no duplicarla
// (antes había una copia con drift: distinto orden de lookup y fallback). Los consumidores de
// operator-config (`operator-actions.ts`) siguen importándola de acá sin cambios.
// Ver docs/estrategia/propuestas-unificacion-blueprint-modules.md.
export { defaultModulesForBlueprint } from "@/blueprints/presets-meta";

// Acento sugerido por el preset del rubro (si el operador no elige uno en el alta).
export function suggestedAccentForBlueprint(
  blueprintId: string | null | undefined,
): { accent: string; theme: "light" | "dark" } | null {
  const meta = presetMetaFor(blueprintId);
  return meta ? { accent: meta.accent, theme: meta.theme } : null;
}

// Planes comerciales (free-form por ahora; los planes reales / feature-flags son
// trabajo futuro de ADR-006). Sirven para etiquetar y, más adelante, gatear límites.
export interface PlanDef {
  id: string;
  label: string;
  hint: string;
}

export const PLANS: PlanDef[] = [
  { id: "trial", label: "Prueba", hint: "Trial inicial, sin cobro." },
  { id: "base", label: "Base", hint: "Catálogo + operación core." },
  { id: "pro", label: "Pro", hint: "Reportes avanzados + integraciones." },
  { id: "enterprise", label: "Enterprise", hint: "Multi-sucursal / a medida." },
];

export const PLAN_IDS = PLANS.map((p) => p.id);

// Estados de tenant (espejo del enum TenantStatus del schema) para la UI.
export const TENANT_STATUSES = [
  { id: "TRIAL", label: "En pruebas" },
  { id: "ACTIVE", label: "Activo" },
  { id: "SUSPENDED", label: "Suspendido" },
] as const;

export type TenantStatusId = (typeof TENANT_STATUSES)[number]["id"];

// Presets de acento disponibles (espejo de ACCENT_PRESETS en branding.ts, sin
// arrastrar Prisma/React.cache a un módulo de dato puro).
export const ACCENT_PRESET_IDS = ["petroleo", "oxblood", "rosa", "celeste", "verde", "ambar"] as const;
