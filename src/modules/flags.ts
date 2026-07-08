// ============================================================================
// FLAG DE LA FUNDACIÓN DE MÓDULOS — reversibilidad (ADR-054 · plan-ventana Balde B).
// ============================================================================
//
// Toda la fundación es código nuevo detrás de este flag. Mientras esté OFF (default),
// el catálogo y el resolver EXISTEN y son inspeccionables/testeables, pero ningún
// cableado del producto los toma como AUTORITATIVOS: el backoffice sigue usando el
// comportamiento legado (`Tenant.modules[]` a secas + operator-config). Prender el
// flag es lo que hace que la resolución por catálogo pase a ENFORCED. Revertible sin
// tocar datos: apagar el flag (o revertir el commit) restaura el estado previo.

/** ¿Está enforced la fundación de módulos? Default OFF. PURA (env inyectable). */
export function moduleRegistryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.MODULE_REGISTRY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// ============================================================================
// FLAG DEL MOTOR DE PERFILES (lite/enterprise) — ADR-058/059, hito M1.
// ============================================================================
//
// El perfil es una SEGUNDA dimensión ortogonal (rol × módulo × perfil). Mientras el
// flag esté OFF (default), `getActiveProfile` devuelve `null` y `perfilGateAllows`
// deja pasar TODO → navegación legada intacta. Prenderlo activa el gating por perfil.
// Reversible sin datos: la resolución vive EN MEMORIA (ADR-059 D1); persistir el perfil
// en `Tenant.profile` es §C · Gate 2 (aún no existe la columna).

/** ¿Está enforced el motor de perfiles (lite/enterprise)? Default OFF. PURA (env inyectable). */
export function profilesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.PROFILES_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
