// ============================================================================
// MOTOR DE PERFILES (lite/enterprise) — predicado + selector puros (ADR-058/059).
// ============================================================================
//
// El PERFIL es la SEGUNDA dimensión de la filosofía GROW-AR (ADR-058): un mismo Core,
// dos motores. `lite` = micro/comerciante (lo mínimo que resuelve); `enterprise` =
// pyme/empresa (el proceso completo). Invariante DURO: `enterprise ⊇ lite` — subir de
// perfil es ADITIVO (se encienden ítems), NUNCA se quita nada ("crecé sin migrar").
//
// ⚠️ NO es "el gemelo probado" del gating de módulos (ADR-059 D1, fix Challenger #1):
// la RESOLUCIÓN reusa el patrón (predicado puro + flag), pero el COMPORTAMIENTO de UI
// (mostrar ítems enterprise bloqueados en lite) es NUEVO y se testea como tal. Este
// leaf solo aporta la lógica pura; la UI la cablea el AdminShell (PR-2).
//
// Client-safe: importa solo `@/lib/capabilities` (puro) y `./gating` (leaf sin deps).
// NO importar Prisma/tenant/barrel `@/modules` → arrastraría server al bundle cliente.

import { roleHasCapability, type Capability, type Role } from "@/lib/capabilities";
import { moduleGateAllows } from "./gating";

/** Perfil del tenant. Nombres de INGENIERÍA — de cara al cliente son "Comercio"/"Empresa" (ADR-059 D7). */
export type Perfil = "lite" | "enterprise";

/**
 * ¿El perfil deja ver un ítem cuyo mínimo es `itemPerfilMin`? PURA.
 * - `activeProfile === null` (flag OFF) → deja pasar todo (comportamiento legado).
 * - ítem sin `perfilMin` o `"lite"` → visible en cualquier perfil (está en el set lite).
 * - ítem `"enterprise"` → visible solo en enterprise.
 *
 * Por construcción esto garantiza `enterprise ⊇ lite`: todo lo visible en lite lo es en
 * enterprise (los `enterprise`-only son lo ÚNICO que lite no ve). El invariante de NAV se
 * blinda en `perfil.test.ts`. OJO: el invariante de DATO ("sin perder un dato" al subir)
 * es OTRA valla, a construir con la persistencia (ADR-059 D2b, §C).
 */
export function perfilGateAllows(
  itemPerfilMin: Perfil | undefined,
  activeProfile: Perfil | null,
): boolean {
  if (activeProfile === null) return true;
  if (!itemPerfilMin || itemPerfilMin === "lite") return true;
  return activeProfile === "enterprise";
}

/** Forma mínima que un ítem de navegación necesita para pasar los tres gates. */
export interface NavGateItem {
  href: string;
  cap: Capability;
  /** Módulo del catálogo que habilita el ítem (ADR-054); ausente = core/config. */
  module?: string;
  /** Perfil mínimo que enciende el ítem; ausente/"lite" = está en el set lite. */
  perfilMin?: Perfil;
}

/**
 * Selector PURO de los ítems visibles, componiendo los TRES ejes: rol × módulo × perfil.
 * Extraído del `AdminShell` para poder testear el invariante sin renderizar (ADR-059 D2).
 * El orden de los filtros es indiferente (AND conmutativo); se testea, no se asume.
 */
export function visibleNavItems<T extends NavGateItem>(
  items: readonly T[],
  ctx: {
    role: Role;
    activeModules: ReadonlySet<string> | null;
    activeProfile: Perfil | null;
  },
): T[] {
  return items.filter(
    (it) =>
      roleHasCapability(ctx.role, it.cap) &&
      moduleGateAllows(it.module, ctx.activeModules) &&
      perfilGateAllows(it.perfilMin, ctx.activeProfile),
  );
}
