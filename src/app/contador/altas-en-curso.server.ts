// Los pedidos de alta del estudio: los que Soporte GSG todavía no cerró y los que DESCARTÓ hace poco,
// con su motivo (ver cartera-alta-reglas.ts). Sin "use server": no es un endpoint. Corre con
// `tenantTransaction` del ESTUDIO: RLS del estudio, sólo sus filas del registro de auditoría.
//
// Nada se pierde por volumen: los abiertos se resuelven en la base (cartera-alta-db.ts) y los
// descartes se leen por su fecha (los últimos 30 días), no «los 200 pedidos más viejos y después
// filtrar», que dejaba afuera, sin aviso, los pedidos nuevos y sus descartes. El panel muestra hasta
// ALTAS_A_LA_VISTA de cada uno y dice cuántos hay en total.

import type { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { leerPedidosAbiertos } from "@/lib/cartera-alta-db";
import {
  ACCION_SOLICITUD_ALTA,
  ACCION_SOLICITUD_DESCARTADA,
  altasDescartadas,
  altasEnCurso,
  DIAS_QUE_SE_MUESTRA_UN_DESCARTE,
  ENTIDAD_SOLICITUD,
  leerSolicitudGuardada,
  type AltaDescartada,
  type AltaEnCurso,
} from "@/lib/cartera-alta-reglas";

/** Cuántos pedidos en curso, y cuántos descartes, se ven en el panel; el resto se cuenta. */
export const ALTAS_A_LA_VISTA = 50;

export interface PedidosDeAltaDelEstudio {
  /** Los ALTAS_A_LA_VISTA en curso más viejos. */
  enCurso: AltaEnCurso[];
  /** Todos los pedidos en curso del estudio. */
  enCursoTotal: number;
  /** Los descartes de los últimos 30 días, del más nuevo al más viejo, hasta ALTAS_A_LA_VISTA. */
  descartadas: AltaDescartada[];
  /** Todos los descartes que corresponde mostrar. */
  descartadasTotal: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const COLUMNAS = { id: true, createdAt: true, changes: true } as const;

/** La lectura, dentro de la transacción del estudio (RLS). Los tests la corren con otro negocio. */
export async function leerPedidosDeAltaDelEstudio(
  tx: Prisma.TransactionClient,
  estudioTenantId: string,
  ahora: Date,
): Promise<PedidosDeAltaDelEstudio> {
  const abiertos = await leerPedidosAbiertos(tx, { estudioTenantId, limite: ALTAS_A_LA_VISTA });
  const pedidoDelEstudio = { tenantId: estudioTenantId, action: ACCION_SOLICITUD_ALTA, entity: ENTIDAD_SOLICITUD };
  const descartes = await tx.auditLog.findMany({
    where: {
      tenantId: estudioTenantId,
      action: ACCION_SOLICITUD_DESCARTADA,
      entity: ENTIDAD_SOLICITUD,
      createdAt: { gte: new Date(ahora.getTime() - DIAS_QUE_SE_MUESTRA_UN_DESCARTE * DIA_MS) },
    },
    select: { entityId: true, createdAt: true, changes: true },
  });
  const ids = [...new Set(descartes.flatMap((d) => (d.entityId ? [d.entityId] : [])))];
  const descartados = ids.length ? await tx.auditLog.findMany({ where: { ...pedidoDelEstudio, id: { in: ids } }, select: COLUMNAS }) : [];
  // «Si después pidió el mismo CUIT, el pedido nuevo manda»: los pedidos del estudio con esos CUIT.
  const cuits = [...new Set(descartados.flatMap((p) => leerSolicitudGuardada(p.changes)?.cuit ?? []))];
  const mismoCuit = cuits.length
    ? await tx.auditLog.findMany({
        where: { ...pedidoDelEstudio, OR: cuits.map((cuit) => ({ changes: { path: ["cuit"], equals: cuit } })) },
        select: COLUMNAS,
      })
    : [];
  const pedidos = [...new Map([...descartados, ...mismoCuit].map((p) => [p.id, p])).values()];
  const todas = altasDescartadas(pedidos, descartes, ahora);
  return {
    enCurso: altasEnCurso(abiertos.filas, []),
    enCursoTotal: abiertos.total,
    descartadas: todas.slice(0, ALTAS_A_LA_VISTA),
    descartadasTotal: todas.length,
  };
}

export async function pedidosDeAltaDelEstudio(estudioTenantId: string, ahora: Date = new Date()): Promise<PedidosDeAltaDelEstudio> {
  return tenantTransaction((tx) => leerPedidosDeAltaDelEstudio(tx, estudioTenantId, ahora), { tenantId: estudioTenantId });
}
