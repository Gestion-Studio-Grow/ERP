// ============================================================================
// CONTEXTO DE APPS DEL NEGOCIO ACTUAL (servidor) — lo que `appsVisibles` necesita saber.
// ============================================================================
//
// La decisión es pura y vive en src/apps/visibles.ts; acá sólo se LEE: la fila del tenant,
// los flags, el perfil y si está la migración cárnica. Todo cacheado por request
// (`react.cache`): el layout, la guardia de la página y "App no disponible" comparten la
// misma lectura.
//
// NO lleva "use server": eso publicaría cada export como endpoint. Es un lector de servidor
// que llaman páginas, layouts y `requireApp`; nunca recibe un tenantId de afuera: el
// negocio es siempre el del request (`getCurrentTenantId`).
//
// `server-only`: importa el valor `prisma`. Si un client component lo importara por error,
// Turbopack fallaría en el build con un mensaje confuso (tsc no lo ve); con esta línea el
// error dice exactamente qué pasó. Next lo resuelve solo, sin instalar el paquete
// (node_modules/next/types/global.d.ts).

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import type { Role } from "@/lib/capabilities";
import { getActiveProfile } from "@/lib/profile-gating";
import { lotesYDespieceListos } from "@/lib/carniceria/schema-probe";
import { resolveRubroId } from "@/blueprints/retail/rubros";
import { catalogo } from "@/modules/catalog";
import { moduleRegistryEnabled, appsInicioValor } from "@/modules/flags";
import {
  resolverContextoApps,
  type ContextoApps,
  type NegocioApps,
  type TenantParaApps,
} from "./visibles";

/**
 * La fila del negocio actual, o `null` si no se pudo leer. Se loguea y NO se tira: una
 * falla acá deja al negocio sin gate por módulo (el comportamiento de hoy) y con las apps
 * `moduloDuro` CERRADAS, porque sin la asignación no hay cómo probar que es la casa.
 */
const leerTenant = cache(async (): Promise<TenantParaApps | null> => {
  try {
    const id = await getCurrentTenantId();
    const t = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, blueprintId: true, modules: true },
    });
    return t ? { id: t.id, slug: t.slug, blueprintId: t.blueprintId, modules: t.modules } : null;
  } catch (err) {
    logger.warn("apps", "no se pudo leer el negocio para decidir sus apps; queda sin gate por módulo", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});

/**
 * El gate por módulo del negocio actual. `null` = sin gate, idéntico a hoy: CH y todo
 * negocio fuera de `APPS_INICIO` o con la asignación vacía.
 */
export const getContextoApps = cache(async (): Promise<ContextoApps | null> => {
  const t = await leerTenant();
  if (!t) return null;
  return resolverContextoApps(
    t,
    { registroGlobal: moduleRegistryEnabled(), appsInicio: appsInicioValor() },
    catalogo(),
  );
});

/** Todo lo que decide qué apps ve una persona con este `role` en el negocio actual. */
export const getNegocioApps = cache(async (role: Role): Promise<NegocioApps> => {
  const [t, contexto, perfil, carniceriaLista] = await Promise.all([
    leerTenant(),
    getContextoApps(),
    getActiveProfile(),
    lotesYDespieceListos(),
  ]);
  return {
    role,
    contexto,
    modulosAsignados: t?.modules ?? [],
    perfil,
    // El mismo criterio que la barra (getCurrentTenantRubro): blueprint retail conocido o,
    // si no hay, el mapa por slug (los locales de MAGRA se llaman magra-<localidad>).
    esMostrador: t ? resolveRubroId({ slug: t.slug, blueprintId: t.blueprintId }) != null : false,
    carniceriaLista,
  };
});
