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
