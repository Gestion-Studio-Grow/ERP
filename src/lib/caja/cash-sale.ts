// Auto-registro del movimiento de VENTA en la caja del POS cuando se cobra una
// venta EN EFECTIVO.
//
// Cuando el mostrador cobra en efectivo, ese dinero entra físicamente al cajón:
// tiene que aparecer como un movimiento VENTA en el turno de caja ABIERTO para que
// el arqueo de cierre cuadre (si no, el cierre marcaría un "sobrante" igual a la
// venta). Este módulo es el puente entre el flujo de venta (order-actions) y la
// caja (CashSession/CashMovement, src/lib/caja-actions.ts).
//
// Vive FUERA de "use server" a propósito (mismo criterio que order-core.ts): lo
// llama la Server Action que ya autorizó (requireCapability) y resolvió el tenant
// (getCurrentTenantId, fail-closed ADR-015). Acá no se autoriza ni se revalida.
//
// Separación pura/persistencia (igual que cash-register.ts): la DECISIÓN de si
// corresponde registrar —y por qué no— es una función pura y unit-testeable
// (`cashSaleEligibility`, sin DB ni tenant); la PERSISTENCIA (buscar la sesión
// abierta, blindar la idempotencia, insertar) vive en `recordCashSaleMovement`.

import { tenantTransaction } from "@/lib/rls";

// Solo la venta cobrada EN EFECTIVO genera efectivo en el cajón. MERCADOPAGO y
// TRANSFERENCIA entran por otra vía (no tocan la caja física), así que no mueven
// el arqueo. Se compara contra el string del enum PaymentMethod sin acoplar el
// import del enum: el llamador ya trae el método validado.
const CASH_METHOD = "EFECTIVO";

// Por qué NO se registró un movimiento (para que el llamador pueda auditar/decidir
// sin adivinar). Las tres primeras son decidibles desde el input (función pura);
// las dos últimas son hechos de runtime (estado de la caja / del ledger).
export type CashSaleSkipReason =
  | "not-paid" // la venta todavía no está cobrada
  | "not-cash" // se cobró, pero no en efectivo (MP / transferencia)
  | "invalid-amount" // total <= 0 o no finito: nada para registrar
  | "no-open-session" // no hay turno de caja abierto: la venta igual se concreta
  | "already-recorded"; // ya existe una VENTA en la caja para este pedido (idempotencia)

// Elegibilidad decidible SOLO desde los datos de la venta (sin tocar la DB).
export type CashSaleEligibility =
  | { eligible: true; amount: number }
  | { eligible: false; reason: Extract<CashSaleSkipReason, "not-paid" | "not-cash" | "invalid-amount"> };

// ¿Esta venta debería generar un movimiento de caja? Pura: misma entrada → misma
// salida, sin efectos. Devuelve el monto ya validado (> 0, finito) cuando aplica.
export function cashSaleEligibility(input: {
  paid: boolean;
  paymentMethod: string | null;
  total: number;
}): CashSaleEligibility {
  if (!input.paid) return { eligible: false, reason: "not-paid" };
  if (input.paymentMethod !== CASH_METHOD) return { eligible: false, reason: "not-cash" };
  if (!Number.isFinite(input.total) || input.total <= 0) {
    return { eligible: false, reason: "invalid-amount" };
  }
  return { eligible: true, amount: input.total };
}

export type RecordCashSaleResult =
  | { recorded: true; movementId: string; sessionId: string }
  | { recorded: false; reason: CashSaleSkipReason };

// Registra (si corresponde) la VENTA en efectivo en el turno de caja abierto del
// tenant. Idempotente por `orderId`: nunca crea dos VENTA para el mismo pedido
// —cubre el doble camino de cobro (crear ya-cobrado vs. marcar cobrado después),
// los reintentos y el doble submit—. Si no hay caja abierta, no falla: la venta ya
// está concretada; simplemente no hay turno donde imputarla (se informa con el
// motivo para que el llamador lo audite).
//
// No lanza por "no corresponde": esos casos vuelven como { recorded: false }. Sí
// puede propagar un error real de DB —el llamador decide si eso debe abortar o no
// (para el mostrador, una venta cobrada NO se revierte por un fallo de caja).
export async function recordCashSaleMovement(
  tenantId: string,
  input: {
    orderId: string;
    orderCode: number;
    paid: boolean;
    paymentMethod: string | null;
    total: number;
    actor: string;
  },
): Promise<RecordCashSaleResult> {
  const elig = cashSaleEligibility(input);
  if (!elig.eligible) return { recorded: false, reason: elig.reason };

  return tenantTransaction<RecordCashSaleResult>(async (tx) => {
    const session = await tx.cashSession.findFirst({
      where: { tenantId, status: "OPEN" },
      select: { id: true },
    });
    if (!session) return { recorded: false, reason: "no-open-session" };

    // Idempotencia: la referencia débil `orderId` es la clave natural de "esta
    // venta ya está imputada a la caja". Se chequea DENTRO de la transacción para
    // cerrar la ventana check-then-insert (el mostrador es un solo cajero por
    // tenant — MVP, ver nota del modelo CashSession—; con multi-caja haría falta
    // un índice único parcial). Se busca en CUALQUIER sesión, no solo la abierta:
    // si la venta ya se imputó en un turno anterior, no se duplica al re-cobrar.
    const existing = await tx.cashMovement.findFirst({
      where: { tenantId, orderId: input.orderId, type: "VENTA" },
      select: { id: true },
    });
    if (existing) return { recorded: false, reason: "already-recorded" };

    const mov = await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: session.id,
        type: "VENTA",
        amount: elig.amount,
        reason: `Venta #${input.orderCode}`,
        orderId: input.orderId,
        createdBy: input.actor,
      },
      select: { id: true },
    });
    return { recorded: true, movementId: mov.id, sessionId: session.id };
  }, { tenantId });
}
