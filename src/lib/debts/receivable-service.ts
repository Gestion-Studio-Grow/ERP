// ============================================================================
// CUENTAS A COBRAR / FIADO (D3) — servicios de escritura (mutaciones). ADR-060 Fase E.
// ============================================================================
//
// Altas y cobros del fiado: crear la deuda del cliente y registrar cobros PARCIALES contra
// el saldo vía `Collection`(RECEIVABLE). El saldo lo computan los loaders (receivable-repo)
// desde los Collections — acá solo se escriben hechos. Comercio: fiado light (sin dueDate);
// Empresa: con vencimiento (lo decide el llamador según perfil).
//
// Con `CUENTAS_CORRIENTES_ENABLED` el cobro además ASIENTA el ingreso en el libro de caja en
// la misma transacción (settlement/asiento-libro.ts): la plata del fiado que entra al cajón
// pasa por el libro y el cierre del día cuadra. Apagado, se comporta como antes.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import { round2 } from "@/lib/round";
import { aplicarConAsientoInTx, applyCollectionInTx } from "@/lib/settlement/collection-repo";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";

export interface CreateReceivableInput {
  clientId: string;
  amount: number;
  concept?: string | null;
  /** Vencimiento — omitir para fiado light (perfil Comercio). */
  dueDate?: Date | null;
  orderId?: string | null;
  createdBy: string;
}

/**
 * Crea una cuenta a cobrar (fiado) con la transacción del LLAMADOR. Valida monto > 0.
 * Devuelve el id.
 *
 * Recibe `tx` y no abre la suya: "dejar a cuenta" desde una venta tiene que crear el pedido y
 * la deuda juntos (si falla una, no queda la otra). El llamador pasa la transacción de su
 * negocio (`tenantTransaction`), con su RLS puesta.
 */
export async function createReceivable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: CreateReceivableInput,
) {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("El monto del fiado debe ser mayor a 0.");
  const r = await tx.accountReceivable.create({
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

/** Lo que llega para registrar un cobro del fiado. */
export interface CobroFiadoInput {
  amount: number;
  method: $Enums.PaymentMethod;
  note?: string | null;
  by: string;
  allowOverpay?: boolean;
}

/**
 * El cobro del fiado DENTRO de la transacción del llamador: lee la deuda y registra el cobro
 * con la guarda de saldo. Con `asentarEnLibro` (CUENTAS_CORRIENTES_ENABLED) además decide el
 * asiento (medio obligatorio, freno de día cerrado) y escribe el INGRESO del libro. Una deuda
 * anulada no se cobra, con el libro o sin él. Exportado para que el test lo ejecute con una
 * transacción falsa; en la app lo llama `collectReceivable`.
 */
export async function cobrarFiadoInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  receivableId: string,
  input: CobroFiadoInput,
  ahora: Date,
  asentarEnLibro = true,
) {
  const r = await tx.accountReceivable.findFirst({
    where: { id: receivableId, tenantId },
    select: { amount: true, status: true, client: { select: { name: true } } },
  });
  if (!r) throw new Error("Cuenta a cobrar no encontrada para este negocio.");
  // Sin esto, con el flag apagado, la URL del detalle de una cuenta anulada aceptaba cobros que
  // ninguna pantalla vuelve a mostrar.
  if (r.status !== "OPEN") throw new Error("Esa cuenta está anulada: no se le puede registrar un cobro.");
  const cobro = {
    originType: "RECEIVABLE" as const,
    originId: receivableId,
    totalCharged: r.amount.toNumber(),
    amount: input.amount,
    method: input.method,
    note: input.note ?? null,
    collectedBy: input.by,
    allowOverpay: input.allowOverpay,
  };
  if (!asentarEnLibro) return applyCollectionInTx(tx, tenantId, cobro);
  return aplicarConAsientoInTx(tx, tenantId, {
    ...cobro,
    origen: "RECEIVABLE",
    detalle: `Cobro de cuenta corriente — ${r.client.name}`,
    ahora,
  });
}

/**
 * Registra un cobro (parcial o total) del fiado vía `Collection`(RECEIVABLE), con la guarda
 * de saldo (no se puede cobrar más que lo que se debe, salvo `allowOverpay`). Devuelve el
 * settlement actualizado (saldo/estado).
 *
 * En UNA transacción Serializable (`cobrarFiadoInTx`), con el libro o sin él: antes, con el
 * flag apagado, la cuenta se leía afuera y el cobro se escribía en otra transacción.
 */
export async function collectReceivable(tenantId: string, receivableId: string, input: CobroFiadoInput) {
  const asentarEnLibro = cuentasCorrientesEnabled();
  return tenantTransaction(
    (tx) => cobrarFiadoInTx(tx, tenantId, receivableId, input, new Date(), asentarEnLibro),
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Anula una cuenta a cobrar (VOID) — cargada por error / cubierta por nota de crédito. */
export async function voidReceivable(tenantId: string, id: string): Promise<boolean> {
  const res = await prisma.accountReceivable.updateMany({
    where: { id, tenantId, status: "OPEN" },
    data: { status: "VOID" },
  });
  return res.count > 0;
}
