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

/**
 * El código del error tal como lo expone Prisma 7 con PrismaPg: el de Prisma («P2021», «P2010»…)
 * y, si vino de Postgres, el SQLSTATE («42P01»), que el adaptador deja en `meta.code` o en
 * `meta.driverAdapterError.cause.originalCode`. Sólo códigos: nunca el mensaje (puede traer datos).
 */
export function codigosDelError(e: unknown): { prisma?: string; postgres?: string } {
  const x = e as {
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } };
    cause?: { originalCode?: unknown; code?: unknown };
  } | null;
  const str = (v: unknown) => (typeof v === "string" && /^[A-Z0-9]{5}$/.test(v) ? v : undefined);
  const prisma = typeof x?.code === "string" && /^P\d{4}$/.test(x.code) ? x.code : undefined;
  const postgres =
    str(x?.meta?.code) ??
    str(x?.meta?.driverAdapterError?.cause?.originalCode) ??
    str(x?.cause?.originalCode) ??
    (prisma ? undefined : str(x?.code)) ??
    (x?.meta?.driverAdapterError?.cause?.kind === "TableDoesNotExist" ? "42P01" : undefined);
  return { prisma, postgres };
}

/** P2021 (Prisma) o 42P01 (Postgres): la tabla todavía no existe (la migración no se aplicó). */
export function esTablaAusente(e: unknown): boolean {
  const { prisma, postgres } = codigosDelError(e);
  return prisma === "P2021" || postgres === "42P01";
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
      // El tenantId del evento lo pone la llave compuesta (tenantId, ticketId): es el del ticket.
      eventos: { create: [{ tipo: "creado", actor: d.creadoPor, datos: { canal: d.canal, prioridad: d.prioridad } }] },
    },
    select: { id: true },
  });
  return { numero, nuevo: true };
}

/**
 * El alta desde «Pedir a Soporte GSG», en la MISMA transacción que la fila de AuditLog pero detrás
 * de un SAVEPOINT. Sólo se tolera la tabla ausente (Gate 2: la migración sin aplicar, o a medio
 * aplicar): se vuelve al SAVEPOINT, se deshace SÓLO el ticket y el pedido queda guardado igual.
 * Cualquier otro error (un bug, una restricción, la base caída) se vuelve al SAVEPOINT, se loguea
 * con su código y se RELANZA: tragarlo escondería un ticket perdido detrás de un «pedido enviado».
 */
export async function crearTicketSinRomperElPedido(tx: Tx, tenantId: string, d: DatosTicketNuevo): Promise<number | null> {
  await tx.$executeRawUnsafe("SAVEPOINT soporte_ticket");
  try {
    const r = await crearTicketEnTx(tx, tenantId, d);
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT soporte_ticket");
    return r?.numero ?? null;
  } catch (e) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT soporte_ticket");
    const codigos = codigosDelError(e);
    if (esTablaAusente(e)) {
      console.warn("[soporte.ticket] sin tabla de tickets: el pedido queda sólo en AuditLog", { tenantId, ...codigos });
      return null;
    }
    console.error("[soporte.ticket] no se pudo crear el ticket del pedido", { tenantId, ...codigos, error: e instanceof Error ? e.name : "desconocido" });
    throw e;
  }
}
