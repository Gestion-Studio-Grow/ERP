// ============================================================================
// CANDADO/TEASER de ítems enterprise-only (ADR-059 D3, fix Challenger #4) — PR-2.
// ============================================================================
//
// El gate de perfil (`perfilGateAllows`, `@/modules/perfil`) es BINARIO: visible u
// oculto. Pero D3 exige un tercer estado para la nav agrupada de PR-2: un ítem
// `enterprise-only` en un tenant `lite` puede mostrarse BLOQUEADO (candado + entrada a
// `UpgradeSheet`) en vez de directamente ocultarse — SIEMPRE detrás de su propio flag
// opt-in (`UPGRADE_TEASER_ENABLED`, default OFF), nunca por defecto (D3: "lite es veneno").
//
// Este leaf solo aporta la LÓGICA PURA del tercer estado; el render (ícono de candado,
// `NavItem` de 3 estados, `UpgradeSheet`) lo cablea quien consuma `PageHeader`/`NavItem`
// (primitivos, PR-2) sobre la nav agrupada (PR-2, AdminShell). Client-safe: solo importa
// `./perfil` (leaf sin deps de servidor).

import { perfilGateAllows, type Perfil } from "./perfil";

/**
 * Estado de render de un ítem de nav frente al candado de perfil:
 * - `"visible"` — se ve y se usa normalmente (lite-o-sin-perfil, o perfil ya alcanzado).
 * - `"locked"`  — enterprise-only en un tenant lite CON el teaser prendido: se renderiza
 *   deshabilitado, con candado + acceso al `UpgradeSheet` (D3, opt-in explícito).
 * - `"hidden"`  — enterprise-only en un tenant lite SIN el teaser (default): no se
 *   renderiza, idéntico al comportamiento de hoy (gating de módulos / perfil binario).
 */
export type NavLockState = "visible" | "locked" | "hidden";

/**
 * Resuelve el estado de candado de un ítem. PURA — mismo patrón que `perfilGateAllows`:
 * - `activeProfile === null` (flag `PROFILES_ENABLED` OFF) → siempre `"visible"` (legado).
 * - `perfilGateAllows` ya dice que sí → `"visible"` (nunca `"locked"`; el candado es solo
 *   para lo que el perfil actual NO alcanza).
 * - Si no alcanza: `"locked"` cuando `teaserEnabled` es `true`, si no `"hidden"`.
 *
 * Garantía de rollback: con `teaserEnabled=false` (default de `UPGRADE_TEASER_ENABLED`)
 * esta función NUNCA devuelve `"locked"` — colapsa exactamente a `visible`/`hidden`, o
 * sea al mismo comportamiento binario de `perfilGateAllows` de hoy. Prender/apagar
 * `UPGRADE_TEASER_ENABLED` no cambia el conjunto de ítems `"visible"`, solo si lo que no
 * se ve se muestra bloqueado (`"locked"`) o simplemente no se muestra (`"hidden"`).
 */
export function resolveNavLockState(
  itemPerfilMin: Perfil | undefined,
  ctx: { activeProfile: Perfil | null; teaserEnabled: boolean },
): NavLockState {
  if (perfilGateAllows(itemPerfilMin, ctx.activeProfile)) return "visible";
  return ctx.teaserEnabled ? "locked" : "hidden";
}
