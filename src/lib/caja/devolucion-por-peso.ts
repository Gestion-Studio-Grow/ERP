// LA DEVOLUCIÓN POR PESO REAL de un pedido ya cobrado (Magra, EVENTUALIDADES §2 caso 2): la marca
// con la que se firma y la cuenta de cuánto se devolvió. Vive aparte, sin dependencias de pedidos,
// porque la leen tres lugares que no se pueden importar entre sí sin un ciclo: el ajuste que la
// escribe (src/lib/ajuste-peso-cobrado.ts), la anulación que tiene que descontarla
// (order-anulacion.ts, `anularVentaInTx`) y el aviso de doble salida (caja/doble-salida.ts).
//
// Es un EGRESO con `orderId`: `@@unique(tenantId, orderId, type)` admite UNO por pedido, y ese
// índice es el árbitro de «se ajusta una sola vez» (el segundo ajuste se rechaza).
import type { Prisma } from "@/generated/prisma/client";
import { round2 } from "@/lib/round";

/** Firma (`createdBy`) del egreso que devuelve la diferencia de un pedido cobrado que pesó menos. */
export const AJUSTE_PESO_ACTOR_PREFIX = "ajuste-peso:";

/** ¿Esta fila del libro es la devolución de un ajuste por peso? */
export function esDevolucionPorPeso(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(AJUSTE_PESO_ACTOR_PREFIX);
}

type Db = Pick<Prisma.TransactionClient, "cashMovement">;

/**
 * Cuánto se le devolvió ya a este pedido por pesar menos (0 si nada). La anulación posterior lo
 * descuenta: sin esto, anular un pedido ajustado sacaba de la caja lo cobrado ENTERO y la
 * diferencia salía dos veces.
 */
export async function devueltoPorPesoDelPedido(db: Db, tenantId: string, orderId: string): Promise<number> {
  const filas = await db.cashMovement.findMany({
    where: { tenantId, orderId, type: "EGRESO", createdBy: { startsWith: AJUSTE_PESO_ACTOR_PREFIX } },
    select: { amount: true },
  });
  return round2(filas.reduce((s, f) => s + Number(f.amount), 0));
}
