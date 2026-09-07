// Auto-registro del movimiento de VENTA en el ledger de caja cuando se cobra una
// venta del mostrador — por CUALQUIER medio.
//
// Historia corta, porque explica el diseño: este puente nació cuando el ledger era
// efectivo puro (el arqueo del turno cuenta el CAJÓN), y por eso sólo asentaba la
// venta cobrada EN EFECTIVO y sólo si había un turno abierto. Desde el Libro de Caja
// (`CashMovement.method`, `sessionId` nullable) el ledger es la caja del NEGOCIO, en
// tres medios: una venta cobrada por Mercado Pago o transferencia es plata que entró
// y tiene que estar en el libro, aunque no toque el cajón. Si no, la dueña la retipea
// a mano — que es exactamente lo que el libro vino a eliminar.
//
// Dos lecturas del mismo asiento, sin descuadrar nada:
//   · El LIBRO (libro-caja.ts) ve la venta en la columna de su medio.
//   · El ARQUEO (cash-register.ts) filtra por medio y cuenta sólo EFECTIVO: una VENTA
//     por MP enganchada al turno NO infla el efectivo esperado. Ya estaba resuelto ahí.
//
// Vive FUERA de "use server" a propósito (mismo criterio que order-core.ts): lo
// llama la Server Action que ya autorizó (requireCapability) y resolvió el tenant
// (getCurrentTenantId, fail-closed ADR-015). Acá no se autoriza ni se revalida.
//
// Separación pura/persistencia (igual que cash-register.ts): la DECISIÓN de si
// corresponde registrar —y con qué medio del libro— es una función pura y
// unit-testeable (`cashSaleEligibility`, sin DB ni tenant); la PERSISTENCIA (buscar el
// turno abierto, blindar la idempotencia, insertar) vive en `recordCashSaleMovementInTx`.
//
// REGLA DE DIRECCIÓN ÚNICA (docs/producto/diseno-cierre-diario-caja.md §4): la venta
// escribe en el libro; el libro NUNCA escribe en pedidos. Este módulo sólo inserta.

import { tenantTransaction } from "@/lib/rls";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import type { Prisma } from "@/generated/prisma/client";

// Cliente de transacción interactiva (mismo patrón que `LedgerTx`): la variante `-InTx`
// corre DENTRO de la tx del llamador para componer con la venta (I7, ADR-064) — así el
// asiento de caja es ATÓMICO con la orden+stock, no una segunda tx que puede fallar suelta.
export type CashSaleTx = Prisma.TransactionClient;

// Por qué NO se registró un movimiento (para que el llamador pueda auditar/decidir
// sin adivinar). Las tres primeras son decidibles desde el input (función pura);
// la última es un hecho de runtime (estado del ledger).
export type CashSaleSkipReason =
  | "not-paid" // la venta todavía no está cobrada
  | "unsupported-method" // se cobró, pero con un medio que el libro no sabe traducir (o sin medio)
  | "invalid-amount" // total <= 0 o no finito: nada para registrar
  | "already-recorded"; // ya existe una VENTA en la caja para este pedido (idempotencia)

// Elegibilidad decidible SOLO desde los datos de la venta (sin tocar la DB). Cuando
// aplica, trae el monto validado (> 0, finito) y el MEDIO DEL LIBRO ya traducido.
export type CashSaleEligibility =
  | { eligible: true; amount: number; method: CashMethod }
  | {
      eligible: false;
      reason: Extract<CashSaleSkipReason, "not-paid" | "unsupported-method" | "invalid-amount">;
    };

// ¿Esta venta debería generar un movimiento de caja, y en qué columna del libro?
// Pura: misma entrada → misma salida, sin efectos.
//
// La traducción PaymentMethod → CashMethod es la ÚNICA del sistema
// (`cashMethodFromPaymentMethod`): EFECTIVO → EFECTIVO; MERCADOPAGO y TRANSFERENCIA →
// MP, porque el negocio lleva Mercado Pago y transferencia en una sola columna. Un
// medio que no traduce (null, o uno futuro) no se adivina: se informa y no se asienta.
export function cashSaleEligibility(input: {
  paid: boolean;
  paymentMethod: string | null;
  total: number;
}): CashSaleEligibility {
  if (!input.paid) return { eligible: false, reason: "not-paid" };
  const method = input.paymentMethod ? cashMethodFromPaymentMethod(input.paymentMethod) : null;
  if (!method) return { eligible: false, reason: "unsupported-method" };
  if (!Number.isFinite(input.total) || input.total <= 0) {
    return { eligible: false, reason: "invalid-amount" };
  }
  return { eligible: true, amount: input.total, method };
}

// `sessionId` es null cuando la venta se asentó SIN turno de mostrador abierto: el
// libro la ve igual (es la caja del negocio); el arqueo no la necesita (no hay turno).
export type RecordCashSaleResult =
  | { recorded: true; movementId: string; sessionId: string | null; method: CashMethod }
  | { recorded: false; reason: CashSaleSkipReason };

// Registra (si corresponde) la VENTA en el ledger de caja del tenant. Idempotente por
// `orderId`: nunca crea dos VENTA para el mismo pedido —cubre el doble camino de cobro
// (crear ya-cobrado vs. marcar cobrado después), los reintentos y el doble submit—.
//
// Sobre el turno de mostrador: si hay uno ABIERTO, el asiento se engancha a ese turno
// para que el arqueo lo vea (si es efectivo, es plata que entró al cajón de verdad). Si
// no hay turno abierto —el caso normal de CH Estética, que no usa turnos— queda suelto
// (`sessionId` NULL) y el libro lo toma igual. Antes esto era un motivo para NO asentar
// ("no-open-session"); dejó de serlo cuando el ledger pasó a ser el libro del negocio y
// no sólo el cajón de un turno: una venta cobrada sin turno abierto es plata que entró.
//
// No lanza por "no corresponde": esos casos vuelven como { recorded: false }. Sí
// puede propagar un error real de DB —el llamador decide si eso debe abortar o no
// (para el mostrador, una venta cobrada NO se revierte por un fallo de caja).
export type CashSaleInput = {
  orderId: string;
  orderCode: number;
  paid: boolean;
  paymentMethod: string | null;
  total: number;
  actor: string;
};

// Cuerpo tx-scoped (I7): registra la VENTA DENTRO de la transacción del llamador, para
// que el asiento de caja sea ATÓMICO con la orden+stock (si algo de la venta falla, no
// queda un movimiento de caja huérfano; si la caja falla, no queda una venta sin asiento
// → ni el arqueo ni el libro descuadran). No abre su propia tx: compone con la del
// llamador (mismo criterio que `recordMovement` del ledger de stock).
//
// NO lanza por "no corresponde" (no cobrada / medio desconocido / ya imputada): esos
// vuelven como { recorded: false }, y el llamador decide. Sí propaga un error real de DB
// → aborta la tx del llamador (la venta entera se revierte), que es justamente la
// atomicidad de I7.
export async function recordCashSaleMovementInTx(
  tx: CashSaleTx,
  tenantId: string,
  input: CashSaleInput,
): Promise<RecordCashSaleResult> {
  const elig = cashSaleEligibility(input);
  if (!elig.eligible) return { recorded: false, reason: elig.reason };

  const session = await tx.cashSession.findFirst({
    where: { tenantId, status: "OPEN" },
    select: { id: true },
  });

  // Idempotencia (dos capas): la referencia débil `orderId` es la clave natural de "esta venta
  // ya está imputada a la caja". (1) PRE-CHECK dentro de la tx — cubre el caso secuencial y es la
  // única guarda mientras el @@unique(tenantId,orderId,type) no esté migrado. (2) El @@unique de
  // A-5 es el árbitro a nivel DB que cierra la carrera del doble-click: si dos submits pasan el
  // pre-check antes de que cualquiera commitee, el `create` de abajo choca P2002 y el LLAMADOR
  // (setOrderPaid / recordCashSaleMovement) lo trata como "ya imputado". Se busca en CUALQUIER
  // sesión (o sin sesión): si ya se imputó antes, no se duplica al re-cobrar. Tampoco importa
  // el medio: un pedido cobrado es UNA entrada de plata, por el medio con el que se cobró.
  const existing = await tx.cashMovement.findFirst({
    where: { tenantId, orderId: input.orderId, type: "VENTA" },
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
      reason: `Venta #${input.orderCode}`,
      orderId: input.orderId,
      createdBy: input.actor,
    },
    select: { id: true },
  });
  return { recorded: true, movementId: mov.id, sessionId: session?.id ?? null, method: elig.method };
}

// Variante STANDALONE: abre su propia tx. Para llamadores que imputan caja de forma
// independiente (no dentro de la tx de una venta). Delega en la variante tx-scoped.
//
// A-5: si el @@unique de A-5 ya está migrado y otra imputación concurrente ganó la carrera, el
// `create` interno choca P2002 y aborta ESTA tx. Se traduce a la condición benigna
// `already-recorded` (idempotente) en vez de propagar un 500 — el asiento ya existe, no falta nada.
export async function recordCashSaleMovement(
  tenantId: string,
  input: CashSaleInput,
): Promise<RecordCashSaleResult> {
  try {
    return await tenantTransaction<RecordCashSaleResult>(
      (tx) => recordCashSaleMovementInTx(tx, tenantId, input),
      { tenantId },
    );
  } catch (e) {
    if (isUniqueViolation(e, "orderId")) return { recorded: false, reason: "already-recorded" };
    throw e;
  }
}
