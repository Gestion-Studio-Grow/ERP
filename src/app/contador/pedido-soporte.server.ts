// Guardar y leer los pedidos a Soporte GSG de un estudio (ver pedido-soporte.ts). Sin "use server":
// no es un endpoint. Todo corre con `tenantTransaction` del ESTUDIO (RLS del estudio): un estudio
// sólo escribe y lee SUS filas; del cliente no se toca nada.

import { tenantTransaction } from "@/lib/rls";
import {
  ACCION_PEDIDO_RESUELTO,
  ACCION_PEDIDO_SOPORTE,
  desdeDeLaVentana,
  ENTIDAD_PEDIDO_SOPORTE,
  pedidosAbiertos,
  respuestasDeSoporte,
  type PedidoAbierto,
  type RespuestaDeSoporte,
  type PedidoValido,
} from "./pedido-soporte";

/** Filas de pedidos y resoluciones del estudio (la misma ventana que la bandeja de Soporte). */
async function filasDelEstudio(
  tx: Parameters<Parameters<typeof tenantTransaction>[0]>[0],
  estudioTenantId: string,
  clienteTenantId?: string,
) {
  const desde = desdeDeLaVentana();
  return tx.auditLog.findMany({
    where: {
      tenantId: estudioTenantId,
      entity: ENTIDAD_PEDIDO_SOPORTE,
      action: { in: [ACCION_PEDIDO_SOPORTE, ACCION_PEDIDO_RESUELTO] },
      createdAt: { gte: desde },
      ...(clienteTenantId ? { OR: [{ entityId: clienteTenantId }, { action: ACCION_PEDIDO_RESUELTO }] } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, entityId: true, changes: true, createdAt: true },
  });
}

/** Los pedidos sin resolver del estudio, para marcarlos en la ficha. */
export async function pedidosAbiertosDelEstudio(estudioTenantId: string): Promise<PedidoAbierto[]> {
  const filas = await tenantTransaction((tx) => filasDelEstudio(tx, estudioTenantId), { tenantId: estudioTenantId });
  return pedidosAbiertos(filas);
}

/** Lo que la ficha muestra: los pedidos abiertos y lo que Soporte GSG ya contestó. */
export async function pedidosDelEstudio(
  estudioTenantId: string,
): Promise<{ abiertos: PedidoAbierto[]; respuestas: RespuestaDeSoporte[] }> {
  const filas = await tenantTransaction((tx) => filasDelEstudio(tx, estudioTenantId), { tenantId: estudioTenantId });
  return { abiertos: pedidosAbiertos(filas), respuestas: respuestasDeSoporte(filas) };
}

/**
 * Deja el pedido. Idempotente: con un pedido ABIERTO del mismo tipo para el mismo cliente no se
 * crea otro (candado por estudio+cliente+tipo dentro de la transacción: dos clics simultáneos dejan
 * uno). Devuelve si ya estaba.
 */
export async function guardarPedidoSoporte(p: {
  estudioTenantId: string;
  actor: string;
  clienteTenantId: string;
  alias: string;
  pedido: PedidoValido;
}): Promise<{ yaEstaba: boolean }> {
  return tenantTransaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pedido-soporte:${p.estudioTenantId}:${p.clienteTenantId}:${p.pedido.tipo}`}))`;
      const abiertos = pedidosAbiertos(await filasDelEstudio(tx, p.estudioTenantId, p.clienteTenantId));
      if (abiertos.some((a) => a.clienteTenantId === p.clienteTenantId && a.tipo === p.pedido.tipo)) {
        return { yaEstaba: true };
      }
      await tx.auditLog.create({
        data: {
          tenantId: p.estudioTenantId,
          actor: p.actor,
          action: ACCION_PEDIDO_SOPORTE,
          entity: ENTIDAD_PEDIDO_SOPORTE,
          entityId: p.clienteTenantId,
          channel: "admin",
          changes: { tipo: p.pedido.tipo, cuit: p.pedido.cuit, nota: p.pedido.nota, alias: p.alias },
        },
      });
      return { yaEstaba: false };
    },
    { tenantId: p.estudioTenantId },
  );
}
