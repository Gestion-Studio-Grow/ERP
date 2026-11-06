// ============================================================================
// CONSOLA DE SOPORTE GSG — el alta de un ticket (T1).
// ============================================================================
//
// Separado de tickets.server.ts para que el camino de la contadora («Pedir a Soporte GSG»,
// pedido-soporte.server.ts) no cargue la conexión de la consola. Recibe una transacción YA PARADA
// en el negocio (tenantTransaction de la app o enElNegocio de la consola). Sin "use server".

import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { DatosTicketNuevo } from "./tickets-core";

type Tx = Prisma.TransactionClient;

/** P2021/42P01: la tabla todavía no existe (la migración no se aplicó). */
export function esTablaAusente(e: unknown): boolean {
  const x = e as { code?: string; meta?: { code?: string } } | null;
  const code = x?.code;
  return code === "P2021" || code === "42P01" || x?.meta?.code === "42P01";
}

export async function hayTablaDeTickets(db: PrismaClient | Tx): Promise<boolean> {
  const r = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"SupportTicket"') IS NOT NULL AS ok`;
  return r[0]?.ok === true;
}

/**
 * Crea el ticket dentro de una transacción YA PARADA en `tenantId`. Idempotente por `origenId` (un
 * pedido, un ticket) y con número correlativo por negocio (candado por negocio: dos altas
 * simultáneas no repiten número). Devuelve el número, o null si la tabla no existe.
 */
export async function crearTicketEnTx(tx: Tx, tenantId: string, d: DatosTicketNuevo): Promise<{ numero: number; nuevo: boolean } | null> {
  if (!(await hayTablaDeTickets(tx))) return null;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`soporte-ticket-numero:${tenantId}`}))`;
  if (d.origenId) {
    const ya = await tx.supportTicket.findUnique({ where: { tenantId_origenId: { tenantId, origenId: d.origenId } }, select: { numero: true } });
    if (ya) return { numero: ya.numero, nuevo: false };
  }
  const max = await tx.supportTicket.aggregate({ where: { tenantId }, _max: { numero: true } });
  const numero = (max._max.numero ?? 0) + 1;
  await tx.supportTicket.create({
    data: {
      tenantId,
      numero,
      tipo: d.tipo,
      prioridad: d.prioridad,
      estado: "nuevo",
      asunto: d.asunto,
      detalle: d.detalle,
      canal: d.canal,
      origenId: d.origenId,
      clienteTenantId: d.clienteTenantId,
      creadoPor: d.creadoPor,
      venceEl: d.venceEl,
      eventos: { create: [{ tenantId, tipo: "creado", actor: d.creadoPor, datos: { canal: d.canal, prioridad: d.prioridad } }] },
    },
    select: { id: true },
  });
  return { numero, nuevo: true };
}

/**
 * El alta desde «Pedir a Soporte GSG», en la MISMA transacción que la fila de AuditLog pero detrás
 * de un SAVEPOINT: si el ticket falla (tabla ausente o lo que sea), se deshace SÓLO el ticket y el
 * pedido queda guardado igual. El pedido es lo que manda; el ticket es la vista de Soporte.
 */
export async function crearTicketSinRomperElPedido(tx: Tx, tenantId: string, d: DatosTicketNuevo): Promise<number | null> {
  await tx.$executeRawUnsafe("SAVEPOINT soporte_ticket");
  try {
    const r = await crearTicketEnTx(tx, tenantId, d);
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT soporte_ticket");
    return r?.numero ?? null;
  } catch (e) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT soporte_ticket");
    if (!esTablaAusente(e)) {
      console.error("[soporte.ticket] no se pudo crear el ticket del pedido", { tenantId, error: e instanceof Error ? e.name : "desconocido" });
    }
    return null;
  }
}

