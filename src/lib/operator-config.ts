// Catálogo del control-plane (ADR-021): MÓDULOS activables, PLANES y presets, más
// los defaults por blueprint. DATO PURO, sin dependencias de servidor: lo importan
// tanto los Server Actions del operador como los componentes de la consola.
//
// Estos módulos son el eje "por-tenant" que hoy falta (ONBOARDING-TENANT §2.3): el
// tenant guarda su lista de módulos activos (`Tenant.modules`), y la idea es que el
// nav del backoffice los respete además del rol. La consola de operador es donde se
// encienden/apagan.

import { presetMetaFor } from "@/blueprints/presets-meta";

// Un módulo del producto que se puede activar por tenant. `capability` lo ata al
// RBAC del backoffice (capabilities.ts); `plugin` marca los que son integraciones.
export interface ModuleDef {
  id: string;
  label: string;
  description: string;
  /** true si es una integración externa (Plugin, ADR-002/020) y no una capability nativa. */
  plugin?: boolean;
}

export const MODULES: ModuleDef[] = [
  { id: "agenda", label: "Agenda / Turnos", description: "Reservas por profesional, boxes y horarios." },
  { id: "pos", label: "Caja / Pedidos (POS)", description: "Venta de mostrador y toma de pedidos." },
  { id: "catalog", label: "Catálogo", description: "Servicios y productos del negocio." },
  { id: "clients", label: "Clientes", description: "Ficha de clientes e historial." },
  { id: "waitlist", label: "Lista de espera", description: "Cola de cancelaciones/no-shows." },
  { id: "reminders", label: "Recordatorios", description: "Avisos y difusión (WhatsApp cuando se conecte)." },
  { id: "reports", label: "Reportes", description: "Ingresos, comisiones y métricas." },
  { id: "commissions", label: "Comisiones", description: "Liquidación por profesional." },
  { id: "arca", label: "Facturación ARCA", description: "Facturación electrónica (Plugin).", plugin: true },
  { id: "mercadopago", label: "Cobro MercadoPago", description: "Cobro online (Plugin).", plugin: true },
];

export const MODULE_IDS = MODULES.map((m) => m.id);

export function isModuleId(id: string): boolean {
  return MODULE_IDS.includes(id);
}

// Módulos que enciende cada blueprint por defecto en el alta. El operador los ajusta
// después desde la consola. Un rubro no listado (comodín) cae a DEFAULT_MODULES.
const DEFAULT_MODULES = ["catalog", "clients", "pos", "reports"];
export const BLUEPRINT_DEFAULT_MODULES: Record<string, string[]> = {
  servicios: ["agenda", "catalog", "clients", "waitlist", "reminders", "reports", "commissions"],
  carniceria: ["pos", "catalog", "clients", "reports", "arca"],
  generico: ["catalog", "clients", "pos", "agenda", "reports"],
};

export function defaultModulesForBlueprint(blueprintId: string | null | undefined): string[] {
  if (blueprintId && BLUEPRINT_DEFAULT_MODULES[blueprintId]) return BLUEPRINT_DEFAULT_MODULES[blueprintId];
  // Presets por rubro de las familias (agenda/oficios/gastronomía) traen su propio set.
  const meta = presetMetaFor(blueprintId);
  if (meta) return meta.modules;
  return DEFAULT_MODULES;
}

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
