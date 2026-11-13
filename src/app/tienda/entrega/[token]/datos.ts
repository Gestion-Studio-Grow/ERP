// ============================================================================
// DELIVERY LOCAL · «ENTREGUÉ» — el acceso a datos de la página pública del repartidor.
// ============================================================================
//
// Sin sesión: lo que habilita es el TOKEN (src/lib/delivery-local/entrega.ts), firmado para ESTE
// pedido de ESTE negocio con el propósito «entrega». El negocio sale del host (fail-closed, como
// /tienda) y todo se lee y se escribe por {id, tenantId}. Lo único que se escribe es UNA fila de
// auditoría (ACCION_ENTREGO), con candado: dos toques o dos pestañas dejan un solo aviso. El estado
// del pedido no se toca.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { authSecret } from "@/lib/auth";
import { ACCION_ENTREGO, type CtxDeLaEntrega, type DepsDeLaEntrega } from "@/lib/delivery-local/entrega";

export async function contextoDeLaEntrega(token: unknown): Promise<CtxDeLaEntrega> {
  const tenantId = await getCurrentTenantId();
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  let secreto: string | null;
  try {
    secreto = authSecret();
  } catch {
    secreto = null; // sin secreto no se verifica ningún link: «link no válido», nunca un 500
  }
  return { tenantId, slug: t?.slug ?? null, secreto, token };
}

export const depsDeLaEntrega: DepsDeLaEntrega = {
  pedido: (tenantId, orderId) =>
    prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true, code: true, status: true, fulfillment: true } }),
  yaAvisado: async (tenantId, orderId) =>
    Boolean(await prisma.auditLog.findFirst({ where: { tenantId, entity: "Order", entityId: orderId, action: ACCION_ENTREGO }, select: { id: true } })),
  marcarEntregaUnaVez: (tenantId, orderId, code) =>
    tenantTransaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery-local-entrego:${tenantId}:${orderId}`}))`;
        const ya = await tx.auditLog.findFirst({
          where: { tenantId, entity: "Order", entityId: orderId, action: ACCION_ENTREGO },
          select: { id: true },
        });
        if (ya) return "ya-estaba" as const;
        await tx.auditLog.create({
          data: { tenantId, actor: "repartidor:link", action: ACCION_ENTREGO, entity: "Order", entityId: orderId, changes: { code }, channel: "public" },
        });
        return "grabada" as const;
      },
      { tenantId },
    ),
};
