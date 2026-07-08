// ============================================================================
// PREDICADO PURO DE GATING POR MÓDULO (ADR-054/055) — client-safe, sin imports.
// ============================================================================
//
// Leaf sin dependencias a propósito: lo consume tanto el layout server (que resuelve
// el set activo con Prisma, `src/lib/module-gating.ts`) como el AdminShell CLIENTE
// (que filtra la navegación). Por eso NO puede importar Prisma/tenant/`@/modules`
// (barrel): arrastraría código de servidor al bundle del cliente.

/**
 * ¿El gating deja ver un ítem atado a `itemModule`? PURA.
 * - `activeModules === null` (flag OFF) → deja pasar todo (comportamiento legado).
 * - ítem sin módulo (core/config: Dashboard, Ajustes, Usuarios…) → siempre visible.
 * - ítem con módulo → visible solo si ese módulo está en el set activo del tenant.
 */
export function moduleGateAllows(
  itemModule: string | undefined,
  activeModules: ReadonlySet<string> | null,
): boolean {
  if (activeModules === null) return true;
  if (!itemModule) return true;
  return activeModules.has(itemModule);
}
