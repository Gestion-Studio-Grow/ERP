// ============================================================================
// MODO DEL HOME por rubro (Wave B) — detección PURA, reversible por flag.
// ============================================================================
//
// El dashboard se adapta al rubro: un tenant de MOSTRADOR/retail (POS activo, sin agenda)
// ve ventas/caja/stock; un tenant de SERVICIOS ve turnos/agenda. La señal es el set de
// módulos ACTIVOS del tenant (`getActiveModuleIds`, ADR-054/055):
//   - `null` (flag `MODULE_REGISTRY_ENABLED` OFF) → "servicios" = home LEGADO (agenda),
//     byte-idéntico a hoy → 100% reversible apagando el flag.
//   - con módulos: "retail" si tiene `pos` y NO `agenda`; si no, "servicios".
//
// PURA y testeable sin DB. No decide DATOS (eso lo hacen los loaders), solo el layout.

export type DashboardMode = "servicios" | "retail";

/**
 * Modo del home a partir de los módulos activos del tenant. PURA.
 * Retail = mostrador (tiene `pos`, no tiene `agenda`). El resto (incl. `null` = flag OFF)
 * cae a "servicios" (agenda), que es el comportamiento legado.
 */
export function dashboardModeForModules(active: ReadonlySet<string> | null): DashboardMode {
  if (!active) return "servicios";
  if (active.has("pos") && !active.has("agenda")) return "retail";
  return "servicios";
}
