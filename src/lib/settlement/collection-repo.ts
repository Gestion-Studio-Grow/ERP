// ============================================================================
// COBRANZA / SETTLEMENT (D9) — repositorio (capa de datos, Prisma). ADR-060 Fase C.5.
// ============================================================================
//
// Registra un cobro (parcial o total) contra un origen (Order|Appointment|AccountReceivable)
// de forma ATÓMICA: dentro de una transacción tenant-aware carga los cobros ya registrados,
// computa el saldo (lógica PURA `computeSettlement`), valida el nuevo cobro contra ese saldo
// (`validateNewCollection`) y recién ahí lo persiste. Así dos cobros concurrentes no pueden
// sobre-cobrar el mismo saldo (la validación y la escritura viven en la misma tx).
//
// El `totalCharged` lo aporta el LLAMADOR (lo sabe el origen: `Order.total`, precio del turno,
// o el monto de la deuda AR) — el repo no acopla la aritmética de cada origen. La conversión
// Decimal↔number vive acá, en el borde (ADR-057): se lee con `.toNumber()`, se escribe `number`.
//
// ⚠️ Requiere la migración D9 (tabla `Collection` + enum) — PREPARADA y SIN aplicar a prod
// (§C · Gate 2).

import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import {
  computeSettlement,
  validateNewCollection,
  isSettled,
  type Settlement,
} from "./collection";

export interface RecordCollectionArgs {
  originType: $Enums.CollectionOriginType;
  /** id del origen (Order/Appointment/AccountReceivable). Siempre presente. */
  originId: string;
  /** FK fuerte cuando el origen ya existe como tabla (ORDER/APPOINTMENT); AR viaja solo por originId. */
  orderId?: string | null;
  appointmentId?: string | null;
  /** Total que se debe cobrar por el origen (lo computa el llamador desde el origen). */
  totalCharged: number;
  /** Monto de ESTE cobro (parcial o total). */
  amount: number;
  method: $Enums.PaymentMethod;
  note?: string | null;
  /** Actor "user:<id>" que registra el cobro. */
  collectedBy: string;
  /** Permitir cobrar por encima del saldo (propina/redondeo a favor). Default false. */
  allowOverpay?: boolean;
}

export interface RecordCollectionResult {
  collectionId: string;
  amount: number;
  /** Settlement del origen DESPUÉS de este cobro (saldo/estado actualizados). */
  settlement: Settlement;
}

/** Cliente de transacción tenant-aware (lo que recibe el callback de `tenantTransaction`). */
type SettlementTx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Suma los montos de los cobros ya registrados para un origen (dentro de la tx dada). */
async function loadCollectedAmounts(
  tx: SettlementTx,
  tenantId: string,
  originType: $Enums.CollectionOriginType,
  originId: string,
): Promise<number[]> {
  const rows = await tx.collection.findMany({
    where: { tenantId, originType, originId },
    select: { amount: true },
  });
  return rows.map((r) => r.amount.toNumber());
}

/**
 * Aplica un cobro/pago contra un origen DENTRO de una transacción ya abierta por el llamador
 * (no abre la suya). Es el núcleo de `recordCollection`, expuesto para COMPONER con otras
 * operaciones en la misma tx (p. ej. la devolución a proveedor D4: revierte stock Y asienta
 * el crédito en cuentas a pagar atómicamente). El llamador DEBE correr la tx en Serializable
 * para que la guarda de saldo resista la concurrencia (fix del Gate de dinero).
 */
export async function applyCollectionInTx(
  tx: SettlementTx,
  tenantId: string,
  args: RecordCollectionArgs,
): Promise<RecordCollectionResult> {
  const previo = await loadCollectedAmounts(tx, tenantId, args.originType, args.originId);
  const settlement = computeSettlement(args.totalCharged, previo);

  const v = validateNewCollection(args.amount, settlement.balance, {
    allowOverpay: args.allowOverpay,
  });
  if (!v.ok) {
    throw new Error(`Movimiento rechazado (${v.error}); saldo pendiente ${settlement.balance}.`);
  }

  const created = await tx.collection.create({
    data: {
      tenantId,
      originType: args.originType,
      originId: args.originId,
      orderId: args.orderId ?? null,
      appointmentId: args.appointmentId ?? null,
      amount: v.amount, // number → Decimal(14,2) en el borde
      method: args.method,
      note: args.note ?? null,
      collectedBy: args.collectedBy,
    },
    select: { id: true },
  });

  const nuevo = computeSettlement(args.totalCharged, [...previo, v.amount]);

  // Coherencia con el booleano legado del POS: si un Order quedó saldado, marcarlo pago.
  if (args.orderId && isSettled(nuevo)) {
    await tx.order.updateMany({
      where: { id: args.orderId, tenantId },
      data: { paid: true },
    });
  }

  return { collectionId: created.id, amount: v.amount, settlement: nuevo };
}

/**
 * Registra un cobro parcial/total contra un origen, atómico y con guarda de saldo.
 * Lanza si el cobro es inválido (≤0, no finito, o excede el saldo sin `allowOverpay`).
 * Si el origen es un `Order` y queda saldado, marca `Order.paid = true` (mantiene coherente
 * el booleano legado sin duplicar la fuente de verdad, que es la suma de Collections).
 */
export async function recordCollection(
  tenantId: string,
  args: RecordCollectionArgs,
): Promise<RecordCollectionResult> {
  return tenantTransaction(
    (tx) => applyCollectionInTx(tx, tenantId, args),
    // 🔒 SERIALIZABLE (fix del Gate de dinero): la guarda "leer saldo → validar → insertar"
    // es correcta en secuencia pero la DERROTA la concurrencia — dos cobros/pagos simultáneos
    // (o un doble-click) leen el MISMO saldo, ambos validan y ambos insertan → SOBRE-COBRO
    // (OVERPAID). Con Serializable, la segunda transacción entra en conflicto de serialización
    // al commit; `tenantTransaction` la REINTENTA (maxRetries auto en Serializable), re-lee el
    // saldo ya actualizado y rechaza el excedente. Uno gana, el otro se rechaza; nunca OVERPAID.
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Devuelve el settlement actual de un origen (saldo/estado) sin registrar nada. */
export async function getSettlementForOrigin(
  tenantId: string,
  originType: $Enums.CollectionOriginType,
  originId: string,
  totalCharged: number,
): Promise<Settlement> {
  const rows = await prisma.collection.findMany({
    where: { tenantId, originType, originId },
    select: { amount: true },
  });
  return computeSettlement(totalCharged, rows.map((r) => r.amount.toNumber()));
}
