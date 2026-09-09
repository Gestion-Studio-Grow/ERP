// ============================================================================
// ROLLOUT POR FLAG — filtra módulos asignados cuyo flag de env está apagado.
// ============================================================================
//
// `ModuleDescriptor.flag` existe desde ADR-054 ("el cableado que consuma el catálogo
// puede apagar el módulo por env sin tocar datos"), pero nadie lo consumía. Este
// helper es ese consumidor: dado el set de módulos ASIGNADOS a un tenant
// (`Tenant.modules`), devuelve solo los que están habilitados por su flag (o que no
// tienen flag). Así un módulo nuevo se puede asignar a un tenant (dato) y mantener
// invisible hasta prender su flag (rollout), y apagarlo es apagar el flag: reversible
// sin migrar ni tocar la asignación.
//
// PURO (env inyectable): sin Prisma, sin React. Client-safe si se le pasa el env.

import type { ModuleRegistry } from "./registry";

/** ¿El valor de env cuenta como "prendido"? Mismo parseo que `flags.ts`. */
function prendido(v: string | undefined): boolean {
  const n = v?.trim().toLowerCase();
  return n === "1" || n === "true" || n === "on" || n === "yes";
}

/**
 * Ids de `modules` cuyo descriptor NO tiene flag, o cuyo flag está prendido en `env`.
 * Ids desconocidos para el catálogo se conservan (no es tarea de este filtro validarlos;
 * de eso se ocupa `resolverActivacion`).
 */
export function filtrarPorFlagDeRollout(
  modules: readonly string[],
  registry: ModuleRegistry,
  env: Record<string, string | undefined> = process.env,
): string[] {
  return modules.filter((id) => {
    const d = registry.buscar(id);
    if (!d?.flag) return true;
    return prendido(env[d.flag]);
  });
}
