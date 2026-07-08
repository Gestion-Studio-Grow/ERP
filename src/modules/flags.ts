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
  return truthy(env.PROFILES_ENABLED);
}

// ============================================================================
// FLAGS DE PR-2/M2 (nav agrupada + candados) — ADR-059, todo DEFAULT OFF.
// ============================================================================
//
// PR-2 se entrega en DOS candados independientes, cada uno con su propio camino de
// rollback (apagar el flag o revertir el commit; cero datos, cero migración):
//
// 1. `NAV_GROUPING_ENABLED` — el interruptor MAESTRO de la interfaz nueva de PR-2 (nav
//    de 5 grupos criollos + densidad + primitivos `PageHeader`/`SectionGroup`/etc., D3/D4/D6).
//    OFF (default) → el backoffice sigue con la nav plana de 17 ítems legada, sin tocar
//    un solo pixel. Es el flag que hace TODO PR-2 reversible de un solo golpe: si algo
//    de la interfaz nueva falla, apagar este flag (o revertir su commit) restaura la nav
//    legada al instante, independiente de si `PROFILES_ENABLED` está prendido o no.
// 2. `UPGRADE_TEASER_ENABLED` — el candado/teaser de ítems `enterprise-only` para un
//    tenant `lite` (D3, fix Challenger #4). Es MÁS FINO que el maestro: gatea solo si
//    esos ítems se muestran BLOQUEADOS (candado + `UpgradeSheet`) o simplemente NO se
//    renderizan (comportamiento de hoy, igual al gating de módulos). Default OFF por
//    regla dura de D3: "lite es veneno" — sembrar candados en la nav del micro por
//    defecto sería decirle "estás en el plan barato". El candado es SIEMPRE opt-in
//    explícito del tenant/venta (§C de producto, no de código), nunca default.
//
// Ninguno de los dos toca `prisma/schema.prisma` ni datos: ambos son 100% en memoria +
// env, igual que `PROFILES_ENABLED`. Apagar cualquiera de los dos NO afecta al otro.

/**
 * ¿Está enforced la nav agrupada de PR-2 (5 grupos + densidad + primitivos)? Default
 * OFF. Interruptor MAESTRO — apagarlo revierte TODO PR-2 a la nav plana legada. PURA.
 */
export function navGroupingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return truthy(env.NAV_GROUPING_ENABLED);
}

/**
 * ¿Se muestran los ítems `enterprise-only` como candado/teaser en un tenant `lite`, en
 * vez de ocultarse? Default OFF (D3: nunca default, opt-in por tenant/venta). Solo tiene
 * efecto si `NAV_GROUPING_ENABLED` y `PROFILES_ENABLED` están ambos ON. PURA.
 */
export function upgradeTeaserEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return truthy(env.UPGRADE_TEASER_ENABLED);
}

/** Parseo booleano compartido de los flags de este archivo (env string → boolean). PURA. */
function truthy(v: string | undefined): boolean {
  const n = v?.trim().toLowerCase();
  return n === "1" || n === "true" || n === "on" || n === "yes";
}
