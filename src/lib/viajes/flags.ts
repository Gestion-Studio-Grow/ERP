// ============================================================================
// FLAG del módulo PRESUPUESTOS DE VIAJE — reversibilidad (default OFF).
// ============================================================================
//
// Todo el módulo (conector, actions, pantalla /admin/viajes, ítem de nav) es código
// nuevo detrás de este flag. OFF (default) ⇒ la pantalla responde 404, las actions
// rechazan, el ítem no aparece en ninguna nav — byte-idéntico al backoffice de hoy.
// Prenderlo NO alcanza solo: además el módulo `viajes` tiene que estar ASIGNADO al
// tenant (`Tenant.modules`, ADR-055) — la agencia lo tiene, la estética no.
//
// Cero imports: EDGE-SAFE y client-safe (mismo criterio que `demo-flag.ts`).

/** ¿Está habilitado el módulo de presupuestos de viaje? Default OFF. PURA (env inyectable). */
export function viajesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.VIAJES_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Proveedor de ofertas a usar (`VIAJES_PROVEEDOR`). Default "stub" (sin red, sin gasto). */
export function viajesProveedorClave(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.VIAJES_PROVEEDOR?.trim().toLowerCase() || "stub";
}

/** Tope diario de búsquedas REALES por tenant y proveedor (`VIAJES_CUOTA_DIARIA`). Default 50. */
export function viajesCuotaDiaria(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.VIAJES_CUOTA_DIARIA);
  return Number.isInteger(n) && n >= 0 ? n : 50;
}
