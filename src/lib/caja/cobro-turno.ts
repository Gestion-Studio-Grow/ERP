// Puente TURNOS → LIBRO DE CAJA: el cobro de un turno asienta una VENTA en el ledger.
//
// El hueco que cierra, medido por QA: `confirmPayment` (/admin/turnos) creaba sólo un
// `Payment` y cero `CashMovement`. Para CH Estética los turnos son la mayor parte de la
// plata, así que el libro que vino a reemplazar la planilla obligaba a retipear a mano
// justamente lo que más se cobra. Ahora el cobro escribe en el libro, una sola vez.
//
// Mismo diseño que el puente del mostrador (cash-sale.ts), a propósito:
//   · DECISIÓN pura (`cobroTurnoEligibility`): ¿corresponde asentar, cuánto y en qué
//     columna del libro? Sin DB ni tenant, unit-testeable.
//   · PERSISTENCIA tx-scoped (`recordCobroTurnoInTx`): corre DENTRO de la tx del cobro,
//     así Payment + turno CONFIRMED + asiento de caja son todo-o-nada (I7, ADR-064).
//   · IDEMPOTENCIA por `paymentId`, en dos capas: pre-check dentro de la tx (cubre el
//     caso secuencial) y `@@unique(tenantId, paymentId, type)` como árbitro a nivel DB
//     (cierra la carrera del doble submit). `Payment` es 1:1 con el turno, así que un
//     `paymentId` identifica UN cobro: confirmar dos veces no puede producir dos filas.
//   · TIPO `VENTA`, no `INGRESO`: es la venta de un servicio, y `VENTA` es el tipo que el
//     libro ya reserva para lo que escribe el sistema —no se tipea a mano ni se borra
//     desde el libro (libro-caja-actions.ts)—. Eso es lo que separa "lo que cargó la
//     dueña" de "lo que cobró el sistema" sin una columna más.
//
// SCHEMA-AHEAD: la columna `paymentId` tiene su migración ESCRITA y SIN aplicar (gate del
// dueño). `settleAppointmentPaymentGuarded` orquesta el cobro para que, si la columna
// todavía no existe (P2022), el cobro se concrete igual SIN el asiento —exactamente el
// comportamiento previo a este puente— en vez de romper el cobro del turno.
//
// REGLA DE DIRECCIÓN ÚNICA (docs/producto/diseno-cierre-diario-caja.md §4): el cobro
// escribe en el libro; el libro NUNCA escribe en turnos ni pagos. Este módulo sólo inserta.

import { isColumnMissing, isUniqueViolation } from "@/lib/prisma-errors";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import type { Prisma } from "@/generated/prisma/client";

export type CobroTurnoTx = Prisma.TransactionClient;

export type CobroTurnoSkipReason =
  | "not-approved" // el pago no está APPROVED: todavía no entró plata
  | "unsupported-method" // medio que el libro no sabe traducir (o vacío)
  | "invalid-amount" // monto <= 0 o no finito
  | "already-recorded"; // ya hay una VENTA para este cobro (idempotencia)

export type CobroTurnoEligibility =
  | { eligible: true; amount: number; method: CashMethod }
  | {
      eligible: false;
      reason: Extract<CobroTurnoSkipReason, "not-approved" | "unsupported-method" | "invalid-amount">;
    };

// ¿Este cobro de turno debería asentarse en el libro, y en qué columna? Pura.
// La traducción PaymentMethod → CashMethod es la ÚNICA del sistema
// (`cashMethodFromPaymentMethod`): MERCADOPAGO y TRANSFERENCIA caen juntas en MP,
// que es como el negocio lleva la columna.
export function cobroTurnoEligibility(input: {
  status: string;
  paymentMethod: string | null;
  amount: number;
}): CobroTurnoEligibility {
  if (input.status !== "APPROVED") return { eligible: false, reason: "not-approved" };
  const method = input.paymentMethod ? cashMethodFromPaymentMethod(input.paymentMethod) : null;
  if (!method) return { eligible: false, reason: "unsupported-method" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { eligible: false, reason: "invalid-amount" };
  }
  return { eligible: true, amount: input.amount, method };
}

// Detalle con el que la fila aparece en el libro. Prefijo fijo "Turno ·" para que se
// reconozca a simple vista entre las filas tipeadas a mano.
export const COBRO_TURNO_PREFIX = "Turno ·";

export function cobroTurnoDetail(input: { serviceName: string; clientName: string }): string {
  const servicio = input.serviceName.trim() || "servicio";
  const cliente = input.clientName.trim();
  return cliente ? `${COBRO_TURNO_PREFIX} ${servicio} — ${cliente}` : `${COBRO_TURNO_PREFIX} ${servicio}`;
}

export type CobroTurnoInput = {
  paymentId: string;
  status: string;
  paymentMethod: string | null;
  amount: number;
  detail: string;
  actor: string;
};

export type RecordCobroTurnoResult =
  | { recorded: true; movementId: string; sessionId: string | null; method: CashMethod }
  | { recorded: false; reason: CobroTurnoSkipReason };

// Asienta (si corresponde) la VENTA del turno DENTRO de la tx del llamador.
//
// Turno de mostrador: si hay uno ABIERTO, el asiento se engancha para que el arqueo lo
// vea (sólo si es efectivo mueve el esperado: `summarizeMovements` filtra por medio). Si
// no hay turno —CH Estética no usa turnos de caja— queda suelto (`sessionId` NULL) y el
// libro lo toma igual.
//
// No lanza por "no corresponde": devuelve { recorded: false, reason }. Sí propaga un
// error real de DB (incluido P2022 si `paymentId` no está migrado y P2002 si otro
// submit ganó la carrera): el LLAMADOR los clasifica con `settleAppointmentPaymentGuarded`.
export async function recordCobroTurnoInTx(
  tx: CobroTurnoTx,
  tenantId: string,
  input: CobroTurnoInput,
): Promise<RecordCobroTurnoResult> {
  const elig = cobroTurnoEligibility(input);
  if (!elig.eligible) return { recorded: false, reason: elig.reason };

  const session = await tx.cashSession.findFirst({
    where: { tenantId, status: "OPEN" },
    select: { id: true },
  });

  // Idempotencia capa 1: pre-check por `paymentId` (cualquier sesión, cualquier medio: un
  // cobro es UNA entrada de plata). Capa 2: el @@unique(tenantId, paymentId, type) hace
  // chocar el `create` de abajo (P2002) si dos submits pasaron el pre-check a la vez.
  const existing = await tx.cashMovement.findFirst({
    where: { tenantId, paymentId: input.paymentId, type: "VENTA" },
    select: { id: true },
  });
  if (existing) return { recorded: false, reason: "already-recorded" };

  const mov = await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: session?.id ?? null,
      type: "VENTA",
      method: elig.method,
      amount: elig.amount,
      reason: input.detail,
      paymentId: input.paymentId,
      createdBy: input.actor,
    },
    select: { id: true },
  });
  return { recorded: true, movementId: mov.id, sessionId: session?.id ?? null, method: elig.method };
}

// Resultado de la orquestación del cobro, para que la acción audite sin adivinar.
export type SettleOutcome<T> =
  | { outcome: "ok"; value: T } // cobro + asiento en una sola tx
  | { outcome: "degraded"; value: T } // cobro SIN asiento: la columna `paymentId` no está migrada
  | { outcome: "race" }; // otro submit ganó: el cobro y su asiento ya existen, no hay nada que reparar

/**
 * Orquesta el cobro de un turno con el puente al libro, tolerando schema-ahead y la
 * carrera del doble submit. Las operaciones vienen INYECTADAS (ADR-026: testeable sin DB).
 *
 *  1. Corre `runWithBridge` (Payment + turno + asiento, UNA tx).
 *  2. Si falla porque la columna `paymentId` no existe (P2022) → la migración todavía no se
 *     aplicó: se corre `runWithoutBridge` (Payment + turno, sin asiento). El turno se cobra
 *     exactamente como antes de este puente; el libro no lo ve. Es la DEGRADACIÓN acordada
 *     mientras el dueño no autorice la migración — nunca un cobro roto ni uno duplicado.
 *  3. Si falla por el @@unique de `paymentId` (P2002) → dos submits simultáneos; el otro ya
 *     dejó el cobro Y su asiento. Idempotente: no se reintenta ni se muestra un error.
 *  4. Cualquier otro error se propaga: la tx entera se revirtió, el cobro no quedó a medias.
 */
export async function settleAppointmentPaymentGuarded<T>(params: {
  runWithBridge: () => Promise<T>;
  runWithoutBridge: () => Promise<T>;
  isMissingPaymentColumn?: (e: unknown) => boolean;
  isPaymentKeyConflict?: (e: unknown) => boolean;
}): Promise<SettleOutcome<T>> {
  const {
    runWithBridge,
    runWithoutBridge,
    isMissingPaymentColumn = (e) => isColumnMissing(e, "paymentId"),
    isPaymentKeyConflict = (e) => isUniqueViolation(e, "paymentId"),
  } = params;
  try {
    return { outcome: "ok", value: await runWithBridge() };
  } catch (e) {
    if (isMissingPaymentColumn(e)) {
      return { outcome: "degraded", value: await runWithoutBridge() };
    }
    if (isPaymentKeyConflict(e)) return { outcome: "race" };
    throw e;
  }
}
