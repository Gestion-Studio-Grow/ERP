/**
 * #T7 · Notas de crédito rechazadas por ARCA: la lista para el dueño y el camino para volver a
 * emitirlas (ver nc-rechazadas-core.ts).
 *
 * Reglas fiscales (que no se rompen acá):
 *   · NUNCA se modifica un comprobante existente. La nota rechazada queda como está (su historia);
 *     la reemisión crea una nota NUEVA con `crearNotaDeCreditoInTx`, que toma la factura FOR UPDATE
 *     y nunca anula más que el saldo. Nada con CAE se toca (trigger comprobante_autorizado_inmutable).
 *   · Sin duplicar: un candado transaccional por (negocio, nota rechazada) ordena dos pedidos a la
 *     vez, y la marca en la auditoría (escrita en la MISMA transacción que la nota nueva) hace que
 *     el segundo conteste «ya se volvió a emitir». El árbitro es la base, no la memoria.
 */
import { crearNotaDeCreditoInTx, type InvoiceTx } from "@/lib/invoice-core";
import { saldoPorAnular } from "@/lib/facturacion/nota-credito-core";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import {
  ACCION_NC_RECHAZO_RESUELTO,
  ACCION_NC_REEMITIDA,
  ACCIONES_QUE_CIERRAN_EL_RECHAZO,
  importeDeLaReemision,
  notasRechazadasPendientes,
  type NotaRechazadaPendiente,
} from "@/lib/facturacion/nc-rechazadas-core";

type Db = Pick<InvoiceTx, "invoice" | "auditLog">;

/**
 * Las notas rechazadas que siguen pidiendo atención. UNA consulta si no hay ninguna rechazada (el
 * caso de todos los días); dos si hay: la marca de cerradas sale de la auditoría.
 */
export async function notasDeCreditoRechazadasSinReemitir(db: Db, tenantId: string): Promise<NotaRechazadaPendiente[]> {
  const rechazadas = await db.invoice.findMany({
    where: { tenantId, status: "REJECTED", comprobanteAsociadoId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      total: true,
      rechazoMotivo: true,
      createdAt: true,
      comprobanteAsociado: {
        select: {
          id: true,
          puntoVenta: true,
          numero: true,
          total: true,
          notasAsociadas: { where: { status: { in: ["PENDING", "AUTHORIZED"] } }, select: { total: true } },
        },
      },
    },
  });
  if (rechazadas.length === 0) return [];
  const marcas = await db.auditLog.findMany({
    where: { tenantId, entity: "Invoice", action: { in: [...ACCIONES_QUE_CIERRAN_EL_RECHAZO] }, entityId: { in: rechazadas.map((r) => r.id) } },
    select: { entityId: true },
  });
  const cerradas = new Set(marcas.flatMap((m) => (m.entityId ? [m.entityId] : [])));
  return notasRechazadasPendientes(
    rechazadas.map((r) => ({
      id: r.id,
      total: Number(r.total),
      rechazoMotivo: r.rechazoMotivo,
      createdAt: r.createdAt,
      factura: r.comprobanteAsociado
        ? {
            id: r.comprobanteAsociado.id,
            puntoVenta: r.comprobanteAsociado.puntoVenta,
            numero: r.comprobanteAsociado.numero,
            total: Number(r.comprobanteAsociado.total),
            notasVivas: r.comprobanteAsociado.notasAsociadas.map((n) => Number(n.total)),
          }
        : null,
    })),
    cerradas,
  );
}

export type ResultadoReemision = { ok: true; notaNuevaId: string } | { ok: false; error: string };

interface Pedido {
  tenantId: string;
  notaId: string;
  /** `user:<id>`: queda en la auditoría. */
  actor: string;
  /** AAAAMMDD (fecha fiscal del día). */
  fecha: string;
}

/** Candado + relectura de la nota rechazada, común a reemitir y a dar por resuelta. */
async function tomarLaNotaRechazadaInTx(tx: InvoiceTx, p: Pick<Pedido, "tenantId" | "notaId">) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`nc-rechazada:${p.tenantId}:${p.notaId}`}, 0))`;
  const nota = await tx.invoice.findFirst({
    where: { id: p.notaId, tenantId: p.tenantId },
    select: { id: true, status: true, total: true, comprobanteAsociadoId: true },
  });
  if (!nota || !nota.comprobanteAsociadoId) return { ok: false as const, error: "No encontramos esa nota de crédito en este negocio." };
  if (nota.status !== "REJECTED") return { ok: false as const, error: "Esa nota de crédito no está rechazada: no hay nada que volver a emitir." };
  const marca = await tx.auditLog.findFirst({
    where: { tenantId: p.tenantId, entity: "Invoice", entityId: p.notaId, action: { in: [...ACCIONES_QUE_CIERRAN_EL_RECHAZO] } },
    select: { action: true },
  });
  if (marca) {
    return {
      ok: false as const,
      error: marca.action === ACCION_NC_REEMITIDA ? "Esa nota de crédito ya se volvió a emitir." : "Esa nota de crédito ya se dio por resuelta.",
    };
  }
  return { ok: true as const, facturaId: nota.comprobanteAsociadoId, importe: Number(nota.total) };
}

/**
 * Vuelve a emitir una nota de crédito rechazada: una nota NUEVA por el mismo importe (o por el saldo
 * de la factura, si quedó menos), con la marca en la auditoría en la misma transacción. Se llama
 * dentro de `tenantTransaction` (RLS del negocio). Nunca lanza por un dato del usuario.
 */
export async function reemitirNotaDeCreditoInTx(tx: InvoiceTx, p: Pedido): Promise<ResultadoReemision> {
  const t = await tomarLaNotaRechazadaInTx(tx, p);
  if (!t.ok) return t;
  // La factura FOR UPDATE ANTES de leer su saldo (crearNotaDeCreditoInTx la vuelve a tomar: mismo tx).
  const fact = await tx.$queryRaw<{ total: string }[]>`
    SELECT total::text AS total FROM "Invoice" WHERE id = ${t.facturaId} AND "tenantId" = ${p.tenantId} FOR UPDATE`;
  if (!fact[0]) return { ok: false, error: "No encontramos la factura de esa nota de crédito." };
  const vivas = await tx.invoice.findMany({
    where: { tenantId: p.tenantId, comprobanteAsociadoId: t.facturaId, status: { in: ["PENDING", "AUTHORIZED"] } },
    select: { total: true },
  });
  const saldo = saldoPorAnular(Number(fact[0].total), sumarAlCentavo(vivas.map((v) => Number(v.total))));
  if (saldo <= 0) return { ok: false, error: "La factura ya quedó anulada entera con otra nota de crédito: no hace falta volver a emitirla." };

  const nueva = await crearNotaDeCreditoInTx(tx, {
    tenantId: p.tenantId,
    facturaId: t.facturaId,
    importe: importeDeLaReemision(t.importe, saldo),
    motivo: "reemisión de la nota de crédito rechazada por ARCA",
    fecha: p.fecha,
  });
  if (!nueva.ok) return nueva;
  await tx.auditLog.create({
    data: {
      tenantId: p.tenantId,
      actor: p.actor,
      action: ACCION_NC_REEMITIDA,
      entity: "Invoice",
      entityId: p.notaId,
      changes: { notaNuevaId: nueva.invoiceId, facturaId: t.facturaId, importe: importeDeLaReemision(t.importe, saldo) },
      channel: "admin",
    },
  });
  return { ok: true, notaNuevaId: nueva.invoiceId };
}

/**
 * El dueño la resolvió fuera del sistema (la hizo a mano en ARCA, o decidió no anular): se deja
 * constancia y la alerta se va. No crea ni toca comprobantes.
 */
export async function darPorResueltoElRechazoInTx(tx: InvoiceTx, p: Omit<Pedido, "fecha"> & { nota: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await tomarLaNotaRechazadaInTx(tx, p);
  if (!t.ok) return t;
  await tx.auditLog.create({
    data: {
      tenantId: p.tenantId,
      actor: p.actor,
      action: ACCION_NC_RECHAZO_RESUELTO,
      entity: "Invoice",
      entityId: p.notaId,
      changes: { facturaId: t.facturaId, nota: p.nota },
      channel: "admin",
    },
  });
  return { ok: true };
}
