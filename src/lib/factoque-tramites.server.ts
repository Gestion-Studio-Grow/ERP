// FACTOQUE · Registrar un trámite de arrepentimiento o de baja (ver src/lib/factoque-tramites.ts).
// Separado de las server actions para poder probarlo contra Postgres sin la sesión de Next.
//
//  · Con sesión del negocio: en SU transacción (RLS), con el candado del cupo (`facturita-cupo:`,
//    el mismo del cambio de plan del operador y de la emisión), si el plan es pago vuelve a Gratis
//    (`Tenant.plan` nulo + fila `factoque.plan`, como «Cambiar plan»), y queda la fila del trámite.
//  · Sin sesión (arrepentimiento público): se busca el negocio Factoque por CUIT (Tenant no tiene
//    RLS; `basePrisma`, como el ruteo por subdominio) y sólo se REGISTRA: no se cambia el plan de
//    nadie por saber un CUIT. La respuesta es la misma se encuentre o no (no revela quién es cliente).

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { ACCION_PLAN_FACTOQUE, BLUEPRINT_CON_TOPE } from "@/lib/facturacion/plan-factoque.server";
import { esPlanFactoquePago } from "@/lib/facturita-planes";
import { ACCION_TRAMITE, numeroDeTramite, type DatosTramite, type Efecto, type TipoTramite } from "@/lib/factoque-tramites";

export interface TramiteRegistrado {
  numero: string;
  efecto: Efecto;
  /** `null` si no había un negocio Factoque con ese CUIT (sólo en el camino público). */
  tenantId: string | null;
}

export async function registrarTramite(
  tipo: TipoTramite,
  datos: DatosTramite,
  sesion: { tenantId: string; userId: string } | null,
  diaAr: string,
): Promise<TramiteRegistrado> {
  const numero = numeroDeTramite(tipo, diaAr);

  if (sesion) {
    const { tenantId, userId } = sesion;
    const efecto = await tenantTransaction(
      async (tx): Promise<Efecto> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`facturita-cupo:${tenantId}`}))`;
        const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, blueprintId: true } });
        if (t?.blueprintId !== BLUEPRINT_CON_TOPE) throw new Error("El trámite es del producto Factoque.");
        let efecto: Efecto = "ya_era_gratis";
        if (esPlanFactoquePago(t.plan)) {
          await tx.tenant.update({ where: { id: tenantId }, data: { plan: null } });
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: `user:${userId}`,
              action: ACCION_PLAN_FACTOQUE,
              entity: "Tenant",
              entityId: tenantId,
              changes: { antes: { plan: t.plan }, despues: { plan: null, vigenciaHasta: null }, por: ACCION_TRAMITE[tipo], tramite: numero },
              channel: "admin",
            },
          });
          efecto = "plan_a_gratis";
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${userId}`,
            action: ACCION_TRAMITE[tipo],
            entity: "Tenant",
            entityId: tenantId,
            changes: { tramite: numero, ...datos, efecto, planAntes: t.plan },
            channel: "admin",
          },
        });
        return efecto;
      },
      { tenantId },
    );
    return { numero, efecto, tenantId };
  }

  const negocio = await basePrisma.tenant.findFirst({
    where: { arcaCuit: datos.cuit, blueprintId: BLUEPRINT_CON_TOPE },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!negocio) {
    // Igual se le da número y se avisa a GSG: puede haber pagado sin haber terminado el alta.
    logger.info("factoque", "trámite público sin negocio con ese CUIT", { tipo, numero });
    return { numero, efecto: "registrado", tenantId: null };
  }
  await tenantTransaction(
    (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: negocio.id,
          actor: `publico:${datos.email}`,
          action: ACCION_TRAMITE[tipo],
          entity: "Tenant",
          entityId: negocio.id,
          changes: { tramite: numero, ...datos, efecto: "registrado" },
          channel: "public",
        },
      }),
    { tenantId: negocio.id },
  );
  return { numero, efecto: "registrado", tenantId: negocio.id };
}
