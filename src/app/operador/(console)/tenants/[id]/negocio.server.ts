// ============================================================================
// LECTURA DEL NEGOCIO PARA LA CONSOLA — lo que decide qué apps ve, leído cross-tenant.
// ============================================================================
//
// La ficha del negocio y las actions de módulos necesitan el mismo dato que usa el panel
// del negocio para decidir sus apps (src/apps/contexto.server.ts), pero leído desde la
// consola: con `operatorPrisma` y por id, porque acá no hay un negocio "del request".
//
// NO lleva "use server": eso publicaría cada export como endpoint, y éste recibe un
// tenantId. Lo importan sólo la página de la ficha y operator-actions.ts, que ya pasaron
// por `requireOperator()`. `server-only` hace que un import desde un client component
// falle en el build con un mensaje claro.

import "server-only";
import { operatorPrisma } from "@/lib/operator-db";
import { resolveRubroId } from "@/blueprints/retail/rubros";
import { moduleRegistryEnabled, profilesEnabled } from "@/modules/flags";
import type { Perfil } from "@/modules/perfil";
import type { FlagsDeApps, NegocioParaActivar } from "./apps-del-negocio";

/** Los flags del deploy que deciden el gate por módulo, leídos del entorno. */
export function flagsDeApps(): FlagsDeApps {
  return { registroGlobal: moduleRegistryEnabled(), appsInicio: process.env.APPS_INICIO };
}

/**
 * ¿Está aplicada la migración cárnica? Misma pregunta que `hasCarniceriaSchema`, pero por la
 * conexión del operador: la de la app corre con el negocio del request y acá no hay uno.
 * Cualquier error → false (se esconden lotes y despiece, igual que en el panel).
 */
async function carniceriaLista(): Promise<boolean> {
  try {
    const rows = await operatorPrisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ProductBatch'`;
    return Number(rows?.[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * El perfil como lo resuelve `getActiveProfile`: `null` con el motor apagado y, si está
 * prendido, la columna del negocio con "lite" como red (la columna puede no estar aplicada).
 */
async function perfilDe(tenantId: string): Promise<Perfil | null> {
  if (!profilesEnabled()) return null;
  try {
    const t = await operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { profile: true } });
    return t?.profile ?? "lite";
  } catch {
    return "lite";
  }
}

/** El negocio con todo lo que decide sus apps, o `null` si no existe. */
export async function leerNegocioParaActivar(tenantId: string): Promise<NegocioParaActivar | null> {
  const t = await operatorPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, blueprintId: true, modules: true },
  });
  if (!t) return null;
  const [lotesListos, perfil] = await Promise.all([carniceriaLista(), perfilDe(t.id)]);
  return {
    id: t.id,
    slug: t.slug,
    blueprintId: t.blueprintId,
    modules: t.modules,
    // El mismo criterio que la barra: blueprint retail conocido o, si no hay, el slug.
    esMostrador: resolveRubroId({ slug: t.slug, blueprintId: t.blueprintId }) != null,
    carniceriaLista: lotesListos,
    perfil,
  };
}
