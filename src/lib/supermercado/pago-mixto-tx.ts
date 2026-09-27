// ============================================================================
// EL LIBRO DE UNA VENTA CON VARIOS MEDIOS — un cobro y un asiento por medio, en la tx del alta.
// ============================================================================
//
// POR QUÉ NO ES UN `CashMovement` CON `orderId` POR MEDIO. `@@unique(tenantId, orderId, type)`
// admite UNA venta por pedido (es el árbitro del doble clic, A-5). Cada medio va como un COBRO
// de la venta (`Collection`, origen ORDER), y el asiento del libro cuelga del cobro
// (`collectionId`, único por tipo): la misma forma que los cobros parciales de turno. El pedido
// queda cobrado con su medio PRINCIPAL (`medioPrincipal`, así no se confunde con una venta a
// cuenta: cobrada y sin medio) y quien lo muestra lee sus cobros para el detalle.
//
// ATÓMICO: corre adentro de la transacción del alta (order-core.ts). Si un asiento falla, no
// queda ni la venta ni el stock descontado.
//
// Si hay un turno de caja abierto, cada asiento se engancha a él (el efectivo entra al arqueo;
// Mercado Pago y transferencia no, como siempre: cash-register.ts sólo cuenta EFECTIVO).

import type { Prisma } from "@/generated/prisma/client";
import { centavosDe } from "@/lib/dinero/redondeo";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import { etiquetaDeMedio, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { fmtMoneyARS } from "@/components/ui/format";
import { PAGO_MIXTO_ACTOR_PREFIX } from "./marcas";

export type { AsientoDePago } from "./pago-mixto";
import type { AsientoDePago } from "./pago-mixto";

export const MENSAJE_TOTAL_CAMBIO =
  "El total de la venta cambió mientras cobrabas (un precio o una promo): revisá los pagos y cobrá de nuevo.";

/** Los asientos tienen que ser dos o más, de medios distintos, y sumar EXACTO el total. PURA. */
export function validarPagosContraElTotal(asientos: readonly AsientoDePago[], total: number): string | null {
  if (asientos.length < 2) return "Un pago mixto lleva al menos dos medios.";
  if (new Set(asientos.map((a) => a.medio)).size !== asientos.length) return "Un medio aparece dos veces en el pago.";
  if (!asientos.every((a) => cashMethodFromPaymentMethod(a.medio) !== null && centavosDe(a.monto) > 0)) {
    return "Hay un pago sin importe o con un medio que el libro no conoce.";
  }
  const suma = asientos.reduce((s, a) => s + centavosDe(a.monto), 0);
  return suma === centavosDe(total) ? null : MENSAJE_TOTAL_CAMBIO;
}

/** Clave de idempotencia del cobro de un medio de la venta: una sola fila por (venta, medio). */
export function claveDelCobroMixto(orderId: string, medio: MedioDeCobro): string {
  return `pago-mixto:${orderId}:${medio}`;
}

export async function imputarPagosMixtosEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  v: { orderId: string; orderCode: number; asientos: readonly AsientoDePago[]; actor: string },
): Promise<{ collectionIds: string[]; sessionId: string | null }> {
  const turno = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  const collectionIds: string[] = [];
  for (const a of v.asientos) {
    const metodo = cashMethodFromPaymentMethod(a.medio);
    if (!metodo) throw new Error(`Medio sin columna en el libro: ${a.medio}`);
    const cobro = await tx.collection.create({
      data: {
        tenantId,
        originType: "ORDER",
        originId: v.orderId,
        orderId: v.orderId,
        amount: a.monto,
        method: a.medio,
        note: `Venta #${v.orderCode}: pago con varios medios`,
        collectedBy: v.actor,
        idempotencyKey: claveDelCobroMixto(v.orderId, a.medio),
      },
      select: { id: true },
    });
    await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: turno?.id ?? null,
        type: "VENTA",
        method: metodo,
        amount: a.monto,
        reason: `Venta #${v.orderCode} · ${etiquetaDeMedio(a.medio)} ${fmtMoneyARS(a.monto)} (pago con varios medios)`,
        collectionId: cobro.id,
        createdBy: `${PAGO_MIXTO_ACTOR_PREFIX}${v.orderId}`,
      },
    });
    collectionIds.push(cobro.id);
  }
  return { collectionIds, sessionId: turno?.id ?? null };
}

/** Los cobros de una venta, como los lee una pantalla: medio y monto. PURA sobre las filas. */
export function pagosDeLaVenta(cobros: readonly { method: string; amount: unknown }[]): AsientoDePago[] {
  return cobros
    .map((c) => ({ medio: c.method as MedioDeCobro, monto: Number(c.amount) }))
    .filter((c) => Number.isFinite(c.monto) && c.monto > 0);
}
