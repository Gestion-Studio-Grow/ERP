// ============================================================================
// APPS OCULTAS — la lectura desde la CONSOLA (servidor). Sin escritura.
// ============================================================================
//
// Lo que la ficha del negocio muestra en «Apps ocultas» y en su Historial: qué apps de
// APPS_OCULTABLES están ocultas hoy y los últimos cambios (quién y cuándo). Va en UNA transacción
// del operador con el GUC del negocio, como `leerInterruptoresDe` (negocio.server.ts): funciona con
// el rol exento y con `app_rls`. La escritura vive en interruptores-escritura.server.ts (trinquete).
//
// `server-only`: importa `operatorPrisma`, que nunca puede llegar al navegador.

import "server-only";
import { operatorPrisma } from "@/lib/operator-db";
import { ACCION_OCULTAR, esFilaDeAppOcultaValida, operadorDeActor, type AppOcultableId } from "@/cambios/interruptores";
import { filtroDeFilasDeOcultas, ocultasDesdeFilas } from "@/cambios/interruptores-core";

/** Una fila del historial de apps ocultas de la ficha. */
export interface CambioDeAppOculta {
  id: string;
  app: AppOcultableId;
  oculto: boolean;
  quien: string;
  cuando: Date;
}

/** Las apps ocultas del negocio leídas desde la consola, o `null` si no se pudo (no se ofrece cambiar). */
export async function leerAppsOcultasDe(
  tenantId: string,
): Promise<{ ocultas: ReadonlySet<AppOcultableId>; historial: CambioDeAppOculta[] } | null> {
  try {
    return await operatorPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      const select = { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true } as const;
      const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
      const [ultimas, recientes] = await Promise.all([
        tx.auditLog.findMany({ where: filtroDeFilasDeOcultas(tenantId), orderBy, distinct: ["entityId"], select }),
        tx.auditLog.findMany({ where: filtroDeFilasDeOcultas(tenantId), orderBy, take: 10, select }),
      ]);
      return {
        ocultas: ocultasDesdeFilas(ultimas),
        historial: recientes.filter(esFilaDeAppOcultaValida).map((f) => ({
          id: f.id,
          app: f.entityId as AppOcultableId,
          oculto: f.action === ACCION_OCULTAR,
          quien: operadorDeActor(f.actor) ?? f.actor,
          cuando: f.createdAt,
        })),
      };
    });
  } catch {
    return null;
  }
}
