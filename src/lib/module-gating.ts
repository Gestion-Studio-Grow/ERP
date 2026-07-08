// ============================================================================
// GATING POR MÓDULO (server) — el "encendido" de la vidriera de módulos (ADR-054/055).
// ============================================================================
//
// Cierra el ciclo de /admin/modulos: cuando la fundación está ENFORCED
// (`MODULE_REGISTRY_ENABLED`), el backoffice ESCONDE las pantallas de los módulos que
// el tenant tiene apagados — el comportamiento "estilo App Store" que espera el dueño.
//
// REVERSIBLE por diseño: con el flag OFF (default) `getActiveModuleIds` devuelve `null`
// y el predicado deja pasar TODO → navegación legada intacta (gateada solo por rol).
// Prender el flag activa el gating; apagarlo lo restaura. Sin migración, sin datos.
//
// El predicado PURO (`moduleGateAllows`) vive en `@/modules/gating` (leaf client-safe);
// acá está solo la parte SERVER (lee el tenant con Prisma + resuelve la variante).

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { catalogo, moduleRegistryEnabled, resolverActivacion } from "@/modules";

export { moduleGateAllows } from "@/modules/gating";

/**
 * Set de ids de módulos ACTIVOS del tenant actual, o `null` si el gating está apagado
 * (flag OFF) → el llamador NO debe gatear. Cacheado por request (`react.cache`).
 */
export const getActiveModuleIds = cache(async (): Promise<Set<string> | null> => {
  if (!moduleRegistryEnabled()) return null;
  const tenantId = await getCurrentTenantId();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { blueprintId: true, modules: true },
  });
  const res = resolverActivacion(
    {
      tenantId,
      blueprintId: tenant?.blueprintId ?? null,
      modules: tenant?.modules ?? [],
    },
    catalogo(),
    { enforced: true },
  );
  return new Set(res.activos.map((d) => d.id));
});
