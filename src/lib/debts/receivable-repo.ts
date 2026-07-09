// ============================================================================
// CUENTAS A COBRAR / FIADO (D3) — loaders backend (Prisma → tipos). ADR-060 Fase E.
// ============================================================================
//
// Lo que las pantallas de fiado van a consumir: listado con SALDO y AGING, y detalle con
// historial de cobros (Collection). El saldo es fuente de verdad única: `amount` − suma de
// `Collection`(RECEIVABLE). Comercio ve fiado light (sin vencimiento → aging NO_DUE_DATE);
// Empresa suma vencimiento/recordatorio. Borde Decimal→number (ADR-057).
//
// ⚠️ Requiere la migración D3 (AccountReceivable) — PREPARADA y SIN aplicar a prod (§C · Gate 2).

import { prisma } from "@/lib/prisma";
import type { $Enums } from "@/generated/prisma/client";
import { computeSettlement, type Settlement } from "@/lib/settlement/collection";
import { computeAging, type Aging } from "./aging";

export interface ReceivableListItem {
  id: string;
  clientId: string;
  clientName: string;
  concept: string | null;
  amount: number;
  /** Cobrado (suma de Collections RECEIVABLE imputadas). */
  collected: number;
  /** Saldo pendiente = amount − collected. */
  balance: number;
  dueDate: Date | null;
  status: $Enums.DebtStatus;
  aging: Aging;
}

export interface CollectionHistoryItem {
  id: string;
  amount: number;
  method: $Enums.PaymentMethod;
  note: string | null;
  at: Date;
  by: string;
}

export interface ReceivableDetail extends ReceivableListItem {
  issueDate: Date;
  orderId: string | null;
  collections: CollectionHistoryItem[];
  settlement: Settlement;
}

/** Suma de cobros por receivable (originId) en un solo query. */
async function collectedByReceivable(
  tenantId: string,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.collection.groupBy({
    by: ["originId"],
    where: { tenantId, originType: "RECEIVABLE", originId: { in: ids } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.originId, r._sum.amount?.toNumber() ?? 0]));
}

/**
 * Lista las cuentas a cobrar (fiado) del tenant con saldo y aging. `asOf` fija el "hoy"
 * del aging (default: ahora). Ordena por vencimiento (las que vencen antes, primero).
 */
export async function listReceivables(
  tenantId: string,
  opts: { asOf?: Date; includeVoid?: boolean; onlyWithBalance?: boolean } = {},
): Promise<ReceivableListItem[]> {
  const asOf = opts.asOf ?? new Date();
  const receivables = await prisma.accountReceivable.findMany({
    where: { tenantId, ...(opts.includeVoid ? {} : { status: "OPEN" }) },
    include: { client: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const paidMap = await collectedByReceivable(tenantId, receivables.map((r) => r.id));

  const items = receivables.map((r) => {
    const amount = r.amount.toNumber();
    const settlement = computeSettlement(amount, [paidMap.get(r.id) ?? 0]);
    return {
      id: r.id,
      clientId: r.clientId,
      clientName: r.client.name,
      concept: r.concept,
      amount: settlement.totalCharged,
      collected: settlement.collected,
      balance: settlement.balance,
      dueDate: r.dueDate,
      status: r.status,
      aging: computeAging(settlement.balance, r.dueDate, asOf),
    };
  });

  return opts.onlyWithBalance ? items.filter((i) => i.balance > 0) : items;
}

/** Detalle de una cuenta a cobrar: saldo, aging e historial de cobros. `null` si no existe. */
export async function getReceivableDetail(
  tenantId: string,
  id: string,
  opts: { asOf?: Date } = {},
): Promise<ReceivableDetail | null> {
  const asOf = opts.asOf ?? new Date();
  const r = await prisma.accountReceivable.findFirst({
    where: { id, tenantId },
    include: { client: { select: { name: true } } },
  });
  if (!r) return null;

  const collections = await prisma.collection.findMany({
    where: { tenantId, originType: "RECEIVABLE", originId: id },
    orderBy: { createdAt: "desc" },
  });

  const amount = r.amount.toNumber();
  const settlement = computeSettlement(
    amount,
    collections.map((c) => c.amount.toNumber()),
  );

  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    concept: r.concept,
    amount: settlement.totalCharged,
    collected: settlement.collected,
    balance: settlement.balance,
    dueDate: r.dueDate,
    status: r.status,
    aging: computeAging(settlement.balance, r.dueDate, asOf),
    issueDate: r.issueDate,
    orderId: r.orderId,
    collections: collections.map((c) => ({
      id: c.id,
      amount: c.amount.toNumber(),
      method: c.method,
      note: c.note,
      at: c.createdAt,
      by: c.collectedBy,
    })),
    settlement,
  };
}
