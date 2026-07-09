// ============================================================================
// CUENTAS A COBRAR / FIADO (D3) — servicios de escritura (mutaciones). ADR-060 Fase E.
// ============================================================================
//
// Altas y cobros del fiado: crear la deuda del cliente y registrar cobros PARCIALES contra
// el saldo vía `Collection`(RECEIVABLE). El saldo lo computan los loaders (receivable-repo)
// desde los Collections — acá solo se escriben hechos. Comercio: fiado light (sin dueDate);
// Empresa: con vencimiento (lo decide el llamador según perfil).

import { prisma } from "@/lib/prisma";
import type { $Enums } from "@/generated/prisma/client";
import { round2 } from "@/lib/round";
import { recordCollection } from "@/lib/settlement/collection-repo";

export interface CreateReceivableInput {
  clientId: string;
  amount: number;
  concept?: string | null;
  /** Vencimiento — omitir para fiado light (perfil Comercio). */
  dueDate?: Date | null;
  orderId?: string | null;
  createdBy: string;
}

/** Crea una cuenta a cobrar (fiado). Valida monto > 0. Devuelve el id. */
export async function createReceivable(tenantId: string, input: CreateReceivableInput) {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("El monto del fiado debe ser mayor a 0.");
  const r = await prisma.accountReceivable.create({
    data: {
      tenantId,
      clientId: input.clientId,
      amount,
      concept: input.concept ?? null,
      dueDate: input.dueDate ?? null,
      orderId: input.orderId ?? null,
      createdBy: input.createdBy,
    },
    select: { id: true },
  });
  return r.id;
}

/**
 * Registra un cobro (parcial o total) del fiado vía `Collection`(RECEIVABLE), con la guarda
 * de saldo de `recordCollection` (no se puede cobrar más que lo que se debe, salvo
 * `allowOverpay`). Devuelve el settlement actualizado (saldo/estado).
 */
export async function collectReceivable(
  tenantId: string,
  receivableId: string,
  input: { amount: number; method: $Enums.PaymentMethod; note?: string | null; by: string; allowOverpay?: boolean },
) {
  const receivable = await prisma.accountReceivable.findFirst({
    where: { id: receivableId, tenantId },
    select: { amount: true },
  });
  if (!receivable) throw new Error("Cuenta a cobrar no encontrada para este negocio.");

  return recordCollection(tenantId, {
    originType: "RECEIVABLE",
    originId: receivableId,
    totalCharged: receivable.amount.toNumber(),
    amount: input.amount,
    method: input.method,
    note: input.note ?? null,
    collectedBy: input.by,
    allowOverpay: input.allowOverpay,
  });
}

/** Anula una cuenta a cobrar (VOID) — cargada por error / cubierta por nota de crédito. */
export async function voidReceivable(tenantId: string, id: string): Promise<boolean> {
  const res = await prisma.accountReceivable.updateMany({
    where: { id, tenantId, status: "OPEN" },
    data: { status: "VOID" },
  });
  return res.count > 0;
}
