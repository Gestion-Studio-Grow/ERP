// ============================================================================
// Los pedidos de alta ABIERTOS, resueltos en la base (no «los N más viejos y después filtrar»).
// ============================================================================
//
// Un pedido (`AuditLog` cartera.solicitud_alta) se cierra con OTRA fila del registro (configurado o
// descartado: ACCIONES_QUE_CIERRAN_LA_SOLICITUD), con `entityId` = el id del pedido y en el mismo
// negocio (el estudio). Prisma no puede negar esa relación, así que el «sin cierre» va en SQL:
// NOT EXISTS sobre el índice [entity, entityId]. Antes la bandeja de Soporte traía los 500 pedidos más
// viejos de la plataforma (y el estudio, sus 200 más viejos), abiertos y cerrados juntos, y recién
// después filtraba: del pedido 501 en adelante nada aparecía, sin ningún aviso.
//
// Sin "use server" (no es un endpoint): la base llega por parámetro, SIEMPRE parada en el estudio
// (RLS más el filtro por negocio). La usan el panel del estudio (su `tenantTransaction`) y la bandeja
// de Soporte, que la corre en cada estudio con `enElNegocio` y junta las páginas: la consola está
// sujeta a RLS en producción, y una consulta de todos los estudios juntos volvía vacía.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ACCION_SOLICITUD_ALTA, ACCIONES_QUE_CIERRAN_LA_SOLICITUD, ENTIDAD_SOLICITUD } from "@/lib/cartera-alta-reglas";

type ConSql = Pick<PrismaClient, "$queryRaw"> | Pick<Prisma.TransactionClient, "$queryRaw">;

/** Un pedido de alta sin cierre, tal como está en el registro. */
export interface PedidoAbierto {
  id: string;
  tenantId: string;
  actor: string;
  changes: unknown;
  createdAt: Date;
}

type Fila = { total: number; id: string | null; tenantId: string | null; actor: string | null; changes: unknown; createdAt: Date | null };

/** Dónde empieza una página: la fecha y el id del último pedido de la anterior. */
export interface ClaveDePedido {
  createdAt: Date;
  id: string;
}

/**
 * Los pedidos abiertos de UN estudio, del más viejo al más nuevo (fecha y, a igual fecha, id), de a
 * `limite`, empezando DESPUÉS de la clave `despuesDe` (paginado por clave: un pedido que se cierra
 * mientras tanto no corre la página). La clave viene con su fecha, no como id a buscar: el pedido de
 * la página anterior puede ser de OTRO estudio, que con RLS no se ve desde éste. `total`: todos los
 * abiertos, no sólo los de esta página. Una sola consulta: el total sale aunque la página venga vacía.
 */
export async function leerPedidosAbiertos(
  db: ConSql,
  opts: { estudioTenantId: string; despuesDe?: ClaveDePedido | null; limite: number },
): Promise<{ filas: PedidoAbierto[]; total: number; hayMas: boolean }> {
  const estudio = opts.estudioTenantId;
  // `createdAt` es `timestamp(3)` sin zona y Prisma lo guarda en UTC: el ISO (con Z) vuelve igual.
  const desdeFecha = opts.despuesDe ? opts.despuesDe.createdAt.toISOString() : null;
  const desdeId = opts.despuesDe?.id ?? null;
  const cierres = [...ACCIONES_QUE_CIERRAN_LA_SOLICITUD];
  const filas = await db.$queryRaw<Fila[]>`
    WITH abiertos AS (
      SELECT p.id, p."tenantId", p.actor, p.changes, p."createdAt"
      FROM "AuditLog" p
      WHERE p.action = ${ACCION_SOLICITUD_ALTA} AND p.entity = ${ENTIDAD_SOLICITUD}
        AND p."tenantId" = ${estudio}::text
        AND NOT EXISTS (
          SELECT 1 FROM "AuditLog" c
          WHERE c.entity = ${ENTIDAD_SOLICITUD} AND c."entityId" = p.id AND c."tenantId" = p."tenantId"
            AND c.action = ANY(${cierres}::text[])
        )
    ),
    pagina AS (
      SELECT a.* FROM abiertos a
      WHERE ${desdeFecha}::text IS NULL
         OR (a."createdAt", a.id) > (${desdeFecha}::text::timestamp(3), ${desdeId}::text)
      ORDER BY a."createdAt", a.id
      LIMIT ${opts.limite + 1}::int
    )
    SELECT t.total, g.id, g."tenantId", g.actor, g.changes, g."createdAt"
    FROM (SELECT COUNT(*)::int AS total FROM abiertos) t
    LEFT JOIN pagina g ON true
    ORDER BY g."createdAt", g.id
  `;
  const total = filas[0]?.total ?? 0;
  const pedidos = filas
    .filter((f): f is Fila & { id: string; tenantId: string; actor: string; createdAt: Date } => f.id !== null)
    .map((f) => ({ id: f.id, tenantId: f.tenantId, actor: f.actor, changes: f.changes, createdAt: f.createdAt }));
  return { filas: pedidos.slice(0, opts.limite), total, hayMas: pedidos.length > opts.limite };
}
