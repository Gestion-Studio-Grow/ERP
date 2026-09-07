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
//   · IDEMPOTENCIA por COBRO, en dos capas: pre-check dentro de la tx (cubre el caso
//     secuencial) y un `@@unique(tenantId, <clave>, type)` como árbitro a nivel DB (cierra
//     la carrera del doble submit). La clave es el cobro concreto:
//       - `collectionId` (vigente): cada cobro PARCIAL del turno —seña al reservar, saldo al
//         completar (src/lib/turnos)— es una fila `Collection` y produce SU asiento. `Payment`
//         pasó a ser el agregado de esos cobros, así que ya no puede ser la clave (el segundo
//         cobro del mismo turno chocaría el @@unique de `paymentId`).
//       - `paymentId` (previa): el cobro único de `confirmPayment`, 1:1 con el turno. Se
//         mantiene para los asientos ya escritos y para quien todavía cobre por ese camino.
//   · TIPO `VENTA`, no `INGRESO`: es la venta de un servicio, y `VENTA` es el tipo que el
//     libro ya reserva para lo que escribe el sistema —no se tipea a mano ni se borra
//     desde el libro (libro-caja-actions.ts)—. Eso es lo que separa "lo que cargó la
//     dueña" de "lo que cobró el sistema" sin una columna más.
//
// SCHEMA-AHEAD: las columnas `paymentId`, `collectionId` y `Collection.idempotencyKey` tienen
// su migración ESCRITA y SIN aplicar (gate del dueño). `settleAppointmentPaymentGuarded`
// orquesta el cobro para que, si alguna todavía no existe (P2022), el cobro se concrete igual
// SIN el asiento —exactamente el comportamiento previo a este puente— en vez de romper el
// cobro del turno.
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
  // Clave de idempotencia del asiento: el cobro parcial (`collectionId`, vigente) o el
  // `Payment` 1:1 (`paymentId`, camino previo). Al menos una; si vienen las dos manda
  // `collectionId` y `paymentId` NO se escribe (chocaría el @@unique en el 2º cobro del turno).
  collectionId?: string;
  paymentId?: string;
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

  // La clave del asiento: el cobro parcial si lo hay; si no, el Payment 1:1 (camino previo).
  const key = input.collectionId
    ? { collectionId: input.collectionId, paymentId: null }
    : input.paymentId
      ? { collectionId: null, paymentId: input.paymentId }
      : null;
  if (!key) throw new Error("recordCobroTurnoInTx: hace falta collectionId o paymentId como clave del asiento.");

  const session = await tx.cashSession.findFirst({
    where: { tenantId, status: "OPEN" },
    select: { id: true },
  });

  // Idempotencia capa 1: pre-check por la clave (cualquier sesión, cualquier medio: un
  // cobro es UNA entrada de plata). Capa 2: el @@unique(tenantId, <clave>, type) hace
  // chocar el `create` de abajo (P2002) si dos submits pasaron el pre-check a la vez.
  const existing = await tx.cashMovement.findFirst({
    where: key.collectionId
      ? { tenantId, collectionId: key.collectionId, type: "VENTA" }
      : { tenantId, paymentId: key.paymentId, type: "VENTA" },
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
      paymentId: key.paymentId,
      collectionId: key.collectionId,
      createdBy: input.actor,
    },
    select: { id: true },
  });
  return { recorded: true, movementId: mov.id, sessionId: session?.id ?? null, method: elig.method };
}

// Resultado de la orquestación del cobro, para que la acción audite sin adivinar.
export type SettleOutcome<T> =
  | { outcome: "ok"; value: T } // cobro + asiento en una sola tx
  | { outcome: "degraded"; value: T } // cobro SIN asiento: alguna columna del puente no está migrada
  | { outcome: "race" }; // otro submit ganó: el cobro y su asiento ya existen, no hay nada que reparar

// Columnas que el camino del cobro escribe y cuya migración puede no estar aplicada
// (schema-ahead). Un P2022 sobre cualquiera → degradar (calificadas por modelo: un P2022 de
// `Order.idempotencyKey` NO es de este camino); un P2002 sobre cualquiera → carrera (el
// nombre del constraint no trae el modelo, se mira el campo).
const COBRO_SCHEMA_COLUMNS = ["CashMovement.paymentId", "CashMovement.collectionId", "Collection.idempotencyKey"] as const;
const COBRO_UNIQUE_FIELDS = ["paymentId", "collectionId", "idempotencyKey"] as const;

/**
 * Orquesta el cobro de un turno con el puente al libro, tolerando schema-ahead y la
 * carrera del doble submit. Las operaciones vienen INYECTADAS (ADR-026: testeable sin DB).
 *
 *  1. Corre `runWithBridge` (Payment + turno + asiento, UNA tx).
 *  2. Si falla porque una columna del puente no existe (P2022 sobre `paymentId`,
 *     `collectionId` o `Collection.idempotencyKey`) → la migración todavía no se aplicó: se
 *     corre `runWithoutBridge` (cobro + turno, sin asiento ni clave persistente). El turno se
 *     cobra exactamente como antes de este puente; el libro no lo ve. Es la DEGRADACIÓN
 *     acordada mientras el dueño no autorice la migración — nunca un cobro roto ni duplicado.
 *  3. Si falla por un @@unique del cobro (P2002 sobre esas mismas columnas) → dos submits
 *     simultáneos; el otro ya dejó el cobro Y su asiento. Idempotente: no se reintenta ni se
 *     muestra un error.
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
    isMissingPaymentColumn = (e) => COBRO_SCHEMA_COLUMNS.some((c) => isColumnMissing(e, c)),
    isPaymentKeyConflict = (e) => COBRO_UNIQUE_FIELDS.some((c) => isUniqueViolation(e, c)),
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
