// ============================================================================
// CUENTAS A PAGAR (D2) — servicios de escritura (mutaciones). ADR-060 Fase D.
// ============================================================================
//
// Altas y movimientos de una deuda a proveedor: crear la deuda, adjuntar cheques diferidos,
// transicionar el estado del cheque (y, al ACREDITAR, asentar el pago como `Collection`), y
// pagar en efectivo/transferencia (parcial o total) vía el mismo `Collection`. El saldo lo
// computan los loaders (payable-repo) desde los Collections — acá solo se escriben hechos.

import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import { round2 } from "@/lib/round";
import { recordCollection } from "@/lib/settlement/collection-repo";
import { canTransitionCheque, type ChequeStatus } from "./cheque";

export interface CreatePayableInput {
  supplierId: string;
  amount: number;
  concept?: string | null;
  dueDate?: Date | null;
  purchaseId?: string | null;
  createdBy: string;
}

/** Crea una cuenta a pagar. Valida monto > 0. Devuelve el id. */
export async function createPayable(tenantId: string, input: CreatePayableInput) {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("El monto de la deuda debe ser mayor a 0.");
  const p = await prisma.accountPayable.create({
    data: {
      tenantId,
      supplierId: input.supplierId,
      amount,
      concept: input.concept ?? null,
      dueDate: input.dueDate ?? null,
      purchaseId: input.purchaseId ?? null,
      createdBy: input.createdBy,
    },
    select: { id: true },
  });
  return p.id;
}

export interface AddChequeInput {
  chequeNumber: string;
  bank: string;
  amount: number;
  dueDate: Date; // fecha DIFERIDA (obligatoria)
  issueDate?: Date;
  endorsedTo?: string | null;
}

/** Adjunta un cheque diferido a una deuda. Nace en PENDING (en cartera). Valida monto/fecha. */
export async function addChequeToPayable(
  tenantId: string,
  payableId: string,
  input: AddChequeInput,
) {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("El monto del cheque debe ser mayor a 0.");
  if (!input.dueDate) throw new Error("El cheque diferido necesita fecha de acreditación.");
  // Scoping: el payable debe ser de este tenant.
  const owner = await prisma.accountPayable.findFirst({
    where: { id: payableId, tenantId },
    select: { id: true },
  });
  if (!owner) throw new Error("Cuenta a pagar no encontrada para este negocio.");

  const c = await prisma.payableCheque.create({
    data: {
      tenantId,
      payableId,
      chequeNumber: input.chequeNumber.trim(),
      bank: input.bank.trim(),
      amount,
      dueDate: input.dueDate,
      issueDate: input.issueDate ?? new Date(),
      endorsedTo: input.endorsedTo?.trim() || null,
      status: "PENDING",
    },
    select: { id: true },
  });
  return c.id;
}

/**
 * Transiciona el estado de un cheque respetando la máquina de estados (guarda pura).
 * Si pasa a CLEARED (acreditó), asienta el pago como `Collection`(PAYABLE) por el monto del
 * cheque en la MISMA transacción → el saldo de la deuda baja recién cuando el cheque paga
 * de verdad. Un cheque que rebota o se anula no genera Collection (no bajó el saldo).
 */
export async function transitionCheque(
  tenantId: string,
  chequeId: string,
  to: ChequeStatus,
  actor: string,
): Promise<void> {
  await tenantTransaction(
    async (tx) => {
      const cheque = await tx.payableCheque.findFirst({
        where: { id: chequeId, tenantId },
        select: { id: true, status: true, amount: true, payableId: true },
      });
      if (!cheque) throw new Error("Cheque no encontrado para este negocio.");
      if (!canTransitionCheque(cheque.status, to)) {
        throw new Error(`Transición de cheque inválida: ${cheque.status} → ${to}.`);
      }

      // 🔒 Compare-and-set: solo transiciona si el cheque SIGUE en el estado que leímos. Un
      // doble-click / dos requests concurrentes ven el mismo `from`; solo UNO matchea el
      // `where status` y afecta 1 fila → el otro afecta 0 y aborta. Así el asiento de pago
      // (Collection) se crea UNA sola vez, nunca dos por el mismo cheque acreditado.
      const res = await tx.payableCheque.updateMany({
        where: { id: chequeId, tenantId, status: cheque.status },
        data: { status: to },
      });
      if (res.count === 0) {
        throw new Error("El cheque cambió de estado (operación concurrente); reintentá.");
      }

      // Acreditó → pagó de verdad: asentar el Collection(PAYABLE) por el monto del cheque.
      if (to === "CLEARED") {
        await tx.collection.create({
          data: {
            tenantId,
            originType: "PAYABLE",
            originId: cheque.payableId,
            amount: cheque.amount, // Decimal → Decimal
            method: "TRANSFERENCIA" as $Enums.PaymentMethod, // un cheque acreditado es transferencia bancaria
            note: `Cheque acreditado (${chequeId})`,
            collectedBy: actor,
          },
        });
      }
    },
    // 🔒 SERIALIZABLE (fix del Gate de dinero): además del compare-and-set, la transacción
    // serializa el asiento del Collection contra cobros concurrentes de la MISMA deuda;
    // `tenantTransaction` reintenta ante conflicto de serialización.
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Paga una deuda en efectivo/transferencia (parcial o total) vía `Collection`(PAYABLE),
 * con la guarda de saldo de `recordCollection` (no se puede pagar más que lo que se debe,
 * salvo `allowOverpay`). Devuelve el settlement actualizado.
 */
export async function payPayable(
  tenantId: string,
  payableId: string,
  input: { amount: number; method: $Enums.PaymentMethod; note?: string | null; by: string; allowOverpay?: boolean },
) {
  const payable = await prisma.accountPayable.findFirst({
    where: { id: payableId, tenantId },
    select: { amount: true },
  });
  if (!payable) throw new Error("Cuenta a pagar no encontrada para este negocio.");

  return recordCollection(tenantId, {
    originType: "PAYABLE",
    originId: payableId,
    totalCharged: payable.amount.toNumber(),
    amount: input.amount,
    method: input.method,
    note: input.note ?? null,
    collectedBy: input.by,
    allowOverpay: input.allowOverpay,
  });
}
