// ============================================================================
// LINKS DE COBRO — la consulta a la base (paginada, con totales del filtro).
// ============================================================================
//
// Dos consultas por página, siempre las mismas (la misma forma que la lista de comprobantes,
// facturacion/lista.server.ts): los totales por estado de TODO el filtro (GROUP BY, suma en
// numeric) y los 50 renglones de la página, con el pedido y su ficha resueltos por JOIN (sin N+1).
// Dentro de `tenantTransaction` (RLS con el GUC del negocio) y con `"tenantId"` explícito.
//
// La fuente es la auditoría (ver links-core.ts): `AuditLog` tiene índice `(tenantId, createdAt)`,
// que sirve al orden y acota al negocio. Medido con 300.000 constancias en un negocio
// (links-postgres.test.ts → .qa/facturacion-escala/rendimiento-links-y-clientes.txt). El índice
// exacto para esta lista queda para la ventana M1 (BACKLOG).

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { redondearAlCentavo, textoAlCentavo } from "@/lib/dinero/redondeo";
import { escaparLike } from "@/lib/facturacion/lista-core";
import type { ConsultaCruda } from "@/lib/facturacion/lista.server";
// La acción con la que `generarLinkDePagoDePedido` deja la constancia del link de un pedido.
import { ACCION_LINK_DE_PAGO } from "@/app/admin/(dashboard)/pedidos/link-de-pago";
import {
  busquedaDeLinks,
  cantidadDelFiltro,
  esEstadoLink,
  paginasDeLinks,
  totalesLinksVacios,
  LINKS_POR_PAGINA,
  type EstadoLink,
  type FiltrosLinks,
  type PaginaDeLinks,
  type RenglonLink,
  type TotalesLinks,
} from "./links-core";


/** Cada link generado del negocio, con su estado según lo que la base sabe (links-core.ts). */
function links(tenantId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT l.id,
           l."createdAt" AS creado,
           CASE WHEN l.entity = 'Order' THEN 'pedido' ELSE 'libre' END AS tipo,
           o.id AS "pedidoId",
           o.code AS codigo,
           CASE WHEN l.entity = 'Order' THEN 'Pedido #' || COALESCE(o.code::text, l.changes->>'code', '')
                ELSE COALESCE(l.changes->>'concepto', '') END AS concepto,
           NULLIF(l.changes->>'referenciaExterna', '') AS referencia,
           COALESCE(NULLIF(c.name, ''), NULLIF(o."customerName", '')) AS cliente,
           NULLIF(o."customerName", '') AS "nombrePedido",
           CASE WHEN jsonb_typeof(l.changes->'monto') = 'number' THEN (l.changes->>'monto')::numeric END AS monto,
           CASE WHEN l.entity <> 'Order' OR o.id IS NULL THEN 'sin-seguimiento'
                WHEN o.status = 'CANCELLED' THEN 'anulado'
                WHEN o.paid THEN 'pagado'
                ELSE 'pendiente' END AS estado,
           CASE WHEN l.entity = 'Order' THEN NULLIF(l.changes->>'url', '') END AS url
    FROM "AuditLog" l
    LEFT JOIN "Order" o ON l.entity = 'Order' AND o.id = l."entityId" AND o."tenantId" = l."tenantId"
    LEFT JOIN "Client" c ON c.id = o."clientId" AND c."tenantId" = l."tenantId"
    WHERE l."tenantId" = ${tenantId}
      AND ((l.entity = 'PaymentLink' AND l.action = 'create') OR (l.entity = 'Order' AND l.action = ${ACCION_LINK_DE_PAGO}))`;
}

/** El WHERE de la búsqueda, sobre las columnas ya resueltas del link. */
function busqueda(q: string): Prisma.Sql {
  const b = busquedaDeLinks(q);
  if (!b.texto) return Prisma.sql`TRUE`;
  const patron = `%${escaparLike(b.texto)}%`;
  const o: Prisma.Sql[] = [
    Prisma.sql`x.concepto ILIKE ${patron}`,
    Prisma.sql`x.referencia ILIKE ${patron}`,
    Prisma.sql`x.cliente ILIKE ${patron}`,
    Prisma.sql`x."nombrePedido" ILIKE ${patron}`,
  ];
  if (b.pedido !== null) o.push(Prisma.sql`x.codigo = ${b.pedido}`);
  if (b.importe !== null) o.push(Prisma.sql`x.monto = ${textoAlCentavo(b.importe)}::numeric`);
  return Prisma.sql`(${Prisma.join(o, " OR ")})`;
}

async function totales(db: ConsultaCruda, tenantId: string, f: FiltrosLinks): Promise<TotalesLinks> {
  const filas = await db.$queryRaw<{ estado: string; cantidad: number; importe: string }[]>(Prisma.sql`
    SELECT x.estado, count(*)::int AS cantidad, COALESCE(sum(x.monto), 0)::text AS importe
    FROM (${links(tenantId)}) x
    WHERE ${busqueda(f.q)}
    GROUP BY x.estado`);
  const t = totalesLinksVacios();
  for (const r of filas) {
    if (!esEstadoLink(r.estado)) continue;
    t.porEstado[r.estado] = { cantidad: r.cantidad, importe: redondearAlCentavo(Number(r.importe)) };
    t.cantidad += r.cantidad;
  }
  return t;
}

type FilaCruda = Omit<RenglonLink, "creado" | "monto" | "estado"> & { creado: Date; monto: string | null; estado: string };

async function renglones(db: ConsultaCruda, tenantId: string, f: FiltrosLinks, salto: number): Promise<RenglonLink[]> {
  const estado = f.estado ? Prisma.sql`AND x.estado = ${f.estado}` : Prisma.empty;
  const filas = await db.$queryRaw<FilaCruda[]>(Prisma.sql`
    SELECT x.id, x.creado, x.tipo, x."pedidoId", x.concepto, x.referencia, x.cliente, x.monto::text AS monto, x.estado, x.url
    FROM (${links(tenantId)}) x
    WHERE ${busqueda(f.q)} ${estado}
    ORDER BY x.creado DESC, x.id DESC
    LIMIT ${LINKS_POR_PAGINA} OFFSET ${salto}`);
  return filas.map((r) => ({
    ...r,
    creado: r.creado.toISOString(),
    monto: r.monto === null ? null : redondearAlCentavo(Number(r.monto)),
    estado: (esEstadoLink(r.estado) ? r.estado : "sin-seguimiento") as EstadoLink,
  }));
}

/** Una página de links con los totales del filtro. `db` es la transacción del negocio. */
export async function paginaDeLinksEn(db: ConsultaCruda, tenantId: string, f: FiltrosLinks): Promise<PaginaDeLinks> {
  const t = await totales(db, tenantId, f);
  const cantidad = cantidadDelFiltro(t, f.estado);
  const paginas = paginasDeLinks(cantidad);
  const pagina = Math.min(f.pagina, paginas);
  const filas = cantidad === 0 ? [] : await renglones(db, tenantId, f, (pagina - 1) * LINKS_POR_PAGINA);
  return { renglones: filas, totales: t, pagina, paginas };
}

/** La página pedida, dentro de la transacción del negocio (RLS). Sin chequeo de rol: lo hace quien llama. */
export function leerPaginaDeLinks(tenantId: string, f: FiltrosLinks): Promise<PaginaDeLinks> {
  return tenantTransaction((tx) => paginaDeLinksEn(tx, tenantId, f), { tenantId });
}
