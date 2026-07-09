// ============================================================================
// CUENTAS A PAGAR (D2) — loaders backend (Prisma → tipos). ADR-060 Fase D.
// ============================================================================
//
// Lo que las pantallas de cuentas a pagar (Empresa) van a consumir: listado con SALDO y
// AGING, y detalle con historial de pagos (Collection) + cheques diferidos. El saldo es
// la fuente de verdad ÚNICA: `amount` − suma de `Collection`(PAYABLE) — no un campo cacheado.
// El borde convierte Decimal→number (ADR-057); del borde para afuera, todo `number`.
//
// ⚠️ Requiere las migraciones D2 (AccountPayable + PayableCheque + enum PAYABLE) — PREPARADAS
// y SIN aplicar a prod (§C · Gate 2).

import { prisma } from "@/lib/prisma";
import type { $Enums } from "@/generated/prisma/client";
import { computeSettlement, type Settlement } from "@/lib/settlement/collection";
import { computeAging, type Aging } from "./aging";
import { committedChequeTotal, type ChequeStatus } from "./cheque";

export interface PayableListItem {
  id: string;
  supplierId: string;
  supplierName: string;
  concept: string | null;
  amount: number;
  /** Pagado (suma de Collections PAYABLE imputadas). */
  paid: number;
  /** Saldo pendiente = amount − paid. */
  balance: number;
  dueDate: Date | null;
  status: $Enums.DebtStatus;
  aging: Aging;
  /** Plata comprometida en cheques entregados/en cartera aún no acreditados. */
  chequesCommitted: number;
}

export interface ChequeView {
  id: string;
  chequeNumber: string;
  bank: string;
  amount: number;
  issueDate: Date;
  dueDate: Date;
  status: ChequeStatus;
  endorsedTo: string | null;
}

export interface PaymentHistoryItem {
  id: string;
  amount: number;
  method: $Enums.PaymentMethod;
  note: string | null;
  at: Date;
  by: string;
}

export interface PayableDetail extends PayableListItem {
  issueDate: Date;
  purchaseId: string | null;
  cheques: ChequeView[];
  payments: PaymentHistoryItem[];
  settlement: Settlement;
}

/** Suma de cobros/pagos por origen (originId) para un originType, en un solo query. */
async function paidByOrigin(
  tenantId: string,
  originType: $Enums.CollectionOriginType,
  originIds: string[],
): Promise<Map<string, number>> {
  if (originIds.length === 0) return new Map();
  const rows = await prisma.collection.groupBy({
    by: ["originId"],
    where: { tenantId, originType, originId: { in: originIds } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.originId, r._sum.amount?.toNumber() ?? 0]));
}

/**
 * Lista las cuentas a pagar del tenant con saldo, aging y compromiso de cheques.
 * `asOf` fija el "hoy" del aging (default: ahora). Ordena por vencimiento (las que
 * vencen antes, primero; sin fecha al final).
 */
export async function listPayables(
  tenantId: string,
  opts: { asOf?: Date; includeVoid?: boolean } = {},
): Promise<PayableListItem[]> {
  const asOf = opts.asOf ?? new Date();
  const payables = await prisma.accountPayable.findMany({
    where: { tenantId, ...(opts.includeVoid ? {} : { status: "OPEN" }) },
    include: { supplier: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const ids = payables.map((p) => p.id);
  const paidMap = await paidByOrigin(tenantId, "PAYABLE", ids);

  // Cheques comprometidos por payable (PENDING/DELIVERED), en un solo query.
  const committedCheques = await prisma.payableCheque.findMany({
    where: { tenantId, payableId: { in: ids.length ? ids : ["_none_"] }, status: { in: ["PENDING", "DELIVERED"] } },
    select: { payableId: true, amount: true, status: true },
  });
  const committedByPayable = new Map<string, { status: ChequeStatus; amount: number }[]>();
  for (const c of committedCheques) {
    const arr = committedByPayable.get(c.payableId) ?? [];
    arr.push({ status: c.status, amount: c.amount.toNumber() });
    committedByPayable.set(c.payableId, arr);
  }

  return payables.map((p) => {
    const amount = p.amount.toNumber();
    const paid = paidMap.get(p.id) ?? 0;
    const settlement = computeSettlement(amount, [paid]);
    return {
      id: p.id,
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      concept: p.concept,
      amount: settlement.totalCharged,
      paid: settlement.collected,
      balance: settlement.balance,
      dueDate: p.dueDate,
      status: p.status,
      aging: computeAging(settlement.balance, p.dueDate, asOf),
      chequesCommitted: committedChequeTotal(committedByPayable.get(p.id) ?? []),
    };
  });
}

/** Detalle de una cuenta a pagar: saldo, aging, cheques e historial de pagos. `null` si no existe. */
export async function getPayableDetail(
  tenantId: string,
  id: string,
  opts: { asOf?: Date } = {},
): Promise<PayableDetail | null> {
  const asOf = opts.asOf ?? new Date();
  const p = await prisma.accountPayable.findFirst({
    where: { id, tenantId },
    include: {
      supplier: { select: { name: true } },
      cheques: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!p) return null;

  const payments = await prisma.collection.findMany({
    where: { tenantId, originType: "PAYABLE", originId: id },
    orderBy: { createdAt: "desc" },
  });

  const amount = p.amount.toNumber();
  const settlement = computeSettlement(
    amount,
    payments.map((c) => c.amount.toNumber()),
  );

  return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplier.name,
    concept: p.concept,
    amount: settlement.totalCharged,
    paid: settlement.collected,
    balance: settlement.balance,
    dueDate: p.dueDate,
    status: p.status,
    aging: computeAging(settlement.balance, p.dueDate, asOf),
    chequesCommitted: committedChequeTotal(
      p.cheques.map((c) => ({ status: c.status, amount: c.amount.toNumber() })),
    ),
    issueDate: p.issueDate,
    purchaseId: p.purchaseId,
    cheques: p.cheques.map((c) => ({
      id: c.id,
      chequeNumber: c.chequeNumber,
      bank: c.bank,
      amount: c.amount.toNumber(),
      issueDate: c.issueDate,
      dueDate: c.dueDate,
      status: c.status,
      endorsedTo: c.endorsedTo,
    })),
    payments: payments.map((c) => ({
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
