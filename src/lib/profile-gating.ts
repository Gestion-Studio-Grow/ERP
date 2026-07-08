// ============================================================================
// RESOLUCIÓN DEL PERFIL (server) — el "motor de perfiles" de GROW-AR (ADR-058/059 D1).
// ============================================================================
//
// Gemelo SERVER de `module-gating.ts`, para la SEGUNDA dimensión (perfil). Con el flag
// `PROFILES_ENABLED` OFF (default) devuelve `null` → el llamador NO gatea por perfil →
// navegación legada intacta. Prenderlo activa el gating.
//
// REVERSIBLE por diseño (ADR-059 D1): la resolución vive EN MEMORIA — default `"lite"`
// + un mapa opcional de overrides por tenant para DEMO (costo cero, ADR-030). Persistir
// el perfil en `Tenant.profile` (columna aditiva) es §C · Gate 2 y HOY NO EXISTE en el
// schema; cuando exista, este resolvedor leerá esa columna en vez del default. No se
// reusa `Tenant.modules[]` como sentinela del perfil (antipatrón DX-6).
//
// El predicado PURO (`perfilGateAllows`) y el selector (`visibleNavItems`) viven en
// `@/modules/perfil` (leaf client-safe); acá está solo la parte SERVER.

import { cache } from "react";
import { getCurrentTenantId } from "@/lib/tenant";
import { profilesEnabled, upgradeTeaserEnabled, type Perfil } from "@/modules";

export { perfilGateAllows, visibleNavItems } from "@/modules/perfil";
export type { Perfil, NavGateItem } from "@/modules/perfil";
export { type NavLockState, resolveNavLockState } from "@/modules/candado";

// Overrides EN MEMORIA por tenantId, solo para DEMO (cero DB). Vacío por ahora: cada
// tenant resuelve al default `"lite"` hasta que exista `Tenant.profile` (§C).
const PROFILE_OVERRIDES: Readonly<Record<string, Perfil>> = {};

/**
 * Perfil activo del tenant actual, o `null` si el motor está apagado (flag OFF) → el
 * llamador NO debe gatear por perfil. Cacheado por request (`react.cache`).
 */
export const getActiveProfile = cache(async (): Promise<Perfil | null> => {
  if (!profilesEnabled()) return null;
  const tenantId = await getCurrentTenantId();
  // §C futuro: leer `Tenant.profile` cuando exista la columna. Hoy: default lite + override demo.
  return PROFILE_OVERRIDES[tenantId] ?? "lite";
});

// ============================================================================
// CANDADO/TEASER (server) — resolución del opt-in por tenant (ADR-059 D3, PR-2).
// ============================================================================
//
// Gemelo SERVER de `resolveNavLockState` (`@/modules/candado`): con el flag
// `UPGRADE_TEASER_ENABLED` OFF (default) devuelve `false` → el llamador renderiza los
// ítems enterprise-only ocultos, no bloqueados (idéntico a hoy). El día que el candado
// se venda como opt-in por tenant (D3: "opt-in explícito del tenant/venta, nunca
// default"), este resolver es el único lugar a tocar — el mapa de overrides ya está
// listo, en memoria, cero DB (mismo patrón que `PROFILE_OVERRIDES`).

// Overrides EN MEMORIA por tenantId, para el opt-in puntual de venta (cero DB). Vacío:
// hoy nadie tiene el teaser prendido salvo que `UPGRADE_TEASER_ENABLED` esté ON global.
const TEASER_OVERRIDES: Readonly<Record<string, boolean>> = {};

/**
 * ¿Este tenant ve los ítems enterprise-only bloqueados (candado) en vez de ocultos?
 * Default `false` (flag OFF) salvo override puntual. Cacheado por request.
 */
export const getUpgradeTeaserEnabled = cache(async (): Promise<boolean> => {
  const tenantId = await getCurrentTenantId();
  return TEASER_OVERRIDES[tenantId] ?? upgradeTeaserEnabled();
});
