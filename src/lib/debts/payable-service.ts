// ============================================================================
// CUENTAS A PAGAR (D2) — servicios de escritura (mutaciones). ADR-060 Fase D.
// ============================================================================
//
// Altas y movimientos de una deuda a proveedor: crear la deuda, adjuntar cheques diferidos,
// transicionar el estado del cheque (y, al ACREDITAR, asentar el pago como `Collection`), y
// pagar en efectivo/transferencia (parcial o total) vía el mismo `Collection`. El saldo lo
// computan los loaders (payable-repo) desde los Collections — acá solo se escriben hechos.
//
// Con `CUENTAS_CORRIENTES_ENABLED`, el pago y el cheque acreditado además ASIENTAN el egreso
// en el libro de caja en la misma transacción (settlement/asiento-libro.ts). Antes la plata
// salía sin pasar por el libro y el cierre del día daba una diferencia que nadie explicaba.

import { tenantTransaction } from "@/lib/rls";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import { round2 } from "@/lib/round";
import { aplicarConAsientoInTx, applyCollectionInTx } from "@/lib/settlement/collection-repo";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { computeSettlement } from "@/lib/settlement/collection";
import { canTransitionCheque, type ChequeStatus } from "./cheque";
import { PagoRechazadoError, validarChequeNuevo, validarPagoAMano } from "./resumen-cuentas";

export interface CreatePayableInput {
  supplierId: string;
  amount: number;
  concept?: string | null;
  dueDate?: Date | null;
  purchaseId?: string | null;
  createdBy: string;
}

/**
 * Crea una cuenta a pagar con la transacción del LLAMADOR. Valida monto > 0. Devuelve el id.
 *
 * Recibe `tx` y no abre la suya: "compra a cuenta corriente" tiene que registrar la compra
 * (y su ingreso de stock) y la deuda juntos; si falla una, no queda la otra.
 */
export async function createPayable(tx: Prisma.TransactionClient, tenantId: string, input: CreatePayableInput) {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("El monto de la deuda debe ser mayor a 0.");
  const p = await tx.accountPayable.create({
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

/** Cliente de la transacción del negocio (lo que recibe el callback de `tenantTransaction`). */
type DebtTx = Prisma.TransactionClient;

/**
 * Lo que falta pagar de la deuda y lo que ya cubren sus cheques sin debitar, leído con `tx`
 * (la transacción del que va a escribir): así la validación y la escritura ven lo mismo. El
 * saldo sale con la regla única (`computeSettlement`), como el detalle de la cuenta.
 */
async function saldoYChequesInTx(
  tx: DebtTx,
  tenantId: string,
  payableId: string,
  total: number,
): Promise<{ saldo: number; chequesSinDebitar: number }> {
  const cobros = await tx.collection.findMany({
    where: { tenantId, originType: "PAYABLE", originId: payableId },
    select: { amount: true },
  });
  const cheques = await tx.payableCheque.findMany({
    where: { tenantId, payableId, status: { in: ["PENDING", "DELIVERED"] } },
    select: { amount: true },
  });
  const saldo = computeSettlement(total, cobros.map((c) => c.amount.toNumber())).balance;
  const chequesSinDebitar = round2(cheques.reduce((s, c) => s + c.amount.toNumber(), 0));
  return { saldo, chequesSinDebitar };
}

/**
 * Un cheque propio nuevo contra la deuda, DENTRO de la transacción del llamador: lee la deuda,
 * su saldo y sus cheques sin debitar, valida que el cheque no cubra más de lo que falta
 * (`validarChequeNuevo`) y recién ahí lo crea. Nace en la chequera o, si `entregado`, ya
 * entregado: entregarlo no mueve plata, así que no hace falta un segundo paso. Antes eran dos
 * operaciones sueltas (alta y entrega) con la validación afuera: si fallaba la entrega quedaba
 * un cheque en la chequera y un mensaje de error, y dos altas simultáneas pasaban el tope.
 * Exportado para que el test lo ejecute con una transacción falsa.
 */
export async function agregarChequeInTx(
  tx: DebtTx,
  tenantId: string,
  payableId: string,
  input: AddChequeInput & { entregado: boolean },
): Promise<{ id: string; monto: number }> {
  if (!input.dueDate) throw new Error("El cheque diferido necesita fecha de acreditación.");
  const deuda = await tx.accountPayable.findFirst({
    where: { id: payableId, tenantId },
    select: { amount: true, status: true },
  });
  if (!deuda) throw new Error("Cuenta a pagar no encontrada para este negocio.");
  if (deuda.status !== "OPEN") throw new PagoRechazadoError("Esa cuenta está anulada: no se le pueden cargar cheques.");
  const v = validarChequeNuevo({ monto: input.amount, ...(await saldoYChequesInTx(tx, tenantId, payableId, deuda.amount.toNumber())) });
  if (!v.ok) throw new PagoRechazadoError(v.error);
  const c = await tx.payableCheque.create({
    data: {
      tenantId,
      payableId,
      chequeNumber: input.chequeNumber.trim(),
      bank: input.bank.trim(),
      amount: v.monto,
      dueDate: input.dueDate,
      issueDate: input.issueDate ?? new Date(),
      endorsedTo: input.endorsedTo?.trim() || null,
      status: input.entregado ? "DELIVERED" : "PENDING",
    },
    select: { id: true },
  });
  return { id: c.id, monto: v.monto };
}

/**
 * Adjunta un cheque diferido a una deuda, con su tope (no cubre más de lo que falta pagar),
 * en una transacción Serializable: dos altas simultáneas no pueden pasar el tope las dos.
 */
export async function addChequeToPayable(
  tenantId: string,
  payableId: string,
  input: AddChequeInput & { entregado: boolean },
): Promise<{ id: string; monto: number }> {
  return tenantTransaction((tx) => agregarChequeInTx(tx, tenantId, payableId, input), {
    tenantId,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

/**
 * El cambio de estado del cheque DENTRO de la transacción del llamador. Exportado para que el
 * test lo ejecute con una transacción falsa; en la app lo llama `transitionCheque`, que abre
 * la transacción Serializable. `asentarEnLibro` es `cuentasCorrientesEnabled()`.
 */
export async function transicionarChequeInTx(
  tx: DebtTx,
  tenantId: string,
  chequeId: string,
  to: ChequeStatus,
  actor: string,
  opts: { asentarEnLibro: boolean; ahora: Date; payableId?: string },
): Promise<void> {
  // `payableId`: la cuenta desde la que se pide el cambio. Si llega, el cheque tiene que ser de
  // ESA cuenta: con un formulario manipulado (chequeId de otra deuda) se auditaba y se
  // revalidaba una cuenta y se movía el cheque de otra.
  const cheque = await tx.payableCheque.findFirst({
    where: { id: chequeId, tenantId, ...(opts.payableId ? { payableId: opts.payableId } : {}) },
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
  // Con cuentas corrientes encendidas, además el EGRESO del libro (un cheque acreditado
  // es transferencia bancaria), con la guarda de saldo y el freno de día cerrado: si hoy
  // la caja ya está cerrada, el cheque no se marca acreditado hasta mañana (el rechazo tira
  // y la transacción entera, con el cambio de estado, vuelve atrás).
  if (to === "CLEARED" && opts.asentarEnLibro) {
    const deuda = await tx.accountPayable.findFirst({
      where: { id: cheque.payableId, tenantId },
      select: { amount: true, supplier: { select: { name: true } } },
    });
    if (!deuda) throw new Error("La cuenta a pagar de este cheque ya no existe.");
    await aplicarConAsientoInTx(tx, tenantId, {
      originType: "PAYABLE",
      originId: cheque.payableId,
      totalCharged: deuda.amount.toNumber(),
      amount: cheque.amount.toNumber(),
      method: "TRANSFERENCIA",
      note: `Cheque acreditado (${chequeId})`,
      collectedBy: actor,
      // Un cheque acreditado es un HECHO del banco: la plata ya salió. Si supera el saldo
      // (la deuda se pagó en parte por otro lado), no se rechaza: queda la deuda en
      // "pagado de más", a la vista, en vez de un cheque que el sistema no deja registrar.
      allowOverpay: true,
      origen: "PAYABLE",
      detalle: `Cheque acreditado — ${deuda.supplier.name}`,
      ahora: opts.ahora,
    });
  } else if (to === "CLEARED") {
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
  payableId?: string,
): Promise<void> {
  await tenantTransaction(
    (tx) =>
      transicionarChequeInTx(tx, tenantId, chequeId, to, actor, {
        asentarEnLibro: cuentasCorrientesEnabled(),
        ahora: new Date(),
        payableId,
      }),
    // 🔒 SERIALIZABLE (fix del Gate de dinero): además del compare-and-set, la transacción
    // serializa el asiento del Collection contra cobros concurrentes de la MISMA deuda;
    // `tenantTransaction` reintenta ante conflicto de serialización.
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Lo que llega para registrar un pago a una deuda. */
export interface PagoDeudaInput {
  amount: number;
  method: $Enums.PaymentMethod;
  note?: string | null;
  by: string;
  allowOverpay?: boolean;
}

/**
 * El pago a una deuda DENTRO de la transacción del llamador: lee la deuda, frena lo que ya
 * cubren los cheques sin debitar (`validarPagoAMano`) y registra el pago con la guarda de
 * saldo. Con `asentarEnLibro` (CUENTAS_CORRIENTES_ENABLED) además decide el asiento (medio
 * obligatorio, freno de día cerrado) y escribe el EGRESO del libro. Una deuda anulada no se
 * paga. Exportado para que el test lo ejecute con una transacción falsa; en la app lo llama
 * `payPayable`.
 */
export async function pagarDeudaInTx(
  tx: DebtTx,
  tenantId: string,
  payableId: string,
  input: PagoDeudaInput,
  ahora: Date,
  asentarEnLibro = true,
) {
  const p = await tx.accountPayable.findFirst({
    where: { id: payableId, tenantId },
    select: { amount: true, status: true, supplier: { select: { name: true } } },
  });
  if (!p) throw new Error("Cuenta a pagar no encontrada para este negocio.");
  if (p.status !== "OPEN") throw new Error("Esa cuenta está anulada: no se le puede registrar un pago.");
  const total = p.amount.toNumber();
  if (!input.allowOverpay) {
    const v = validarPagoAMano({ monto: input.amount, ...(await saldoYChequesInTx(tx, tenantId, payableId, total)) });
    if (!v.ok) throw new PagoRechazadoError(v.error);
  }
  const pago = {
    originType: "PAYABLE" as const,
    originId: payableId,
    totalCharged: total,
    amount: input.amount,
    method: input.method,
    note: input.note ?? null,
    collectedBy: input.by,
    allowOverpay: input.allowOverpay,
  };
  if (!asentarEnLibro) return applyCollectionInTx(tx, tenantId, pago);
  return aplicarConAsientoInTx(tx, tenantId, {
    ...pago,
    origen: "PAYABLE",
    detalle: `Pago a proveedor — ${p.supplier.name}`,
    ahora,
  });
}

/**
 * Paga una deuda en efectivo/transferencia (parcial o total) vía `Collection`(PAYABLE),
 * con la guarda de saldo (no se puede pagar más que lo que se debe, salvo `allowOverpay`) y
 * la de los cheques sin debitar. Todo en UNA transacción Serializable, con el libro o sin él:
 * antes, con el flag apagado, la deuda se leía afuera y el pago se escribía en otra
 * transacción. Devuelve el settlement actualizado.
 */
export async function payPayable(tenantId: string, payableId: string, input: PagoDeudaInput) {
  const asentarEnLibro = cuentasCorrientesEnabled();
  return tenantTransaction(
    (tx) => pagarDeudaInTx(tx, tenantId, payableId, input, new Date(), asentarEnLibro),
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
