// EL SALDO DE UN PEDIDO CON UNA PARTE YA COBRADA (cobros parciales D9, `Order.collections`).
//
// Hoy nace de un solo camino: el pedido cobrado ANTES de pesar que pesó MÁS
// (src/lib/ajuste-peso-cobrado.ts). Lo que se había cobrado queda como un cobro del pedido y el
// pedido vuelve a «sin cobrar» por la diferencia. Todo lo que cobra un pedido sin cobrar (el botón
// «Cobrar», «Entregar», el link de Mercado Pago, el aviso de pago) tiene que cobrar el SALDO y no
// el total: si cobrara el total, la clienta pagaría dos veces lo que ya pagó. Por eso la cuenta vive
// acá, una sola, y la leen todos.
//
// El cobro del saldo NO puede ser una segunda VENTA con `orderId`: `@@unique(tenantId, orderId,
// type)` admite una sola (la del cobro original). Va como un cobro del pedido con su asiento colgado
// del cobro (`collectionId`), la misma forma que el pago con varios medios (pago-mixto-tx.ts).
import type { Prisma } from "@/generated/prisma/client";
import { centavosDe } from "@/lib/dinero/redondeo";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import { fmtMoneyARS } from "@/components/ui/format";

/** Lo que falta cobrar de un pedido, al centavo y nunca negativo. PURA. */
export function saldoDelPedido(total: number, cobros: readonly number[]): number {
  const falta = centavosDe(total) - cobros.reduce((s, c) => s + centavosDe(c), 0);
  return falta > 0 ? falta / 100 : 0;
}

/** Firma del cobro del saldo (y del asiento que cuelga de él). */
export const SALDO_PEDIDO_ACTOR_PREFIX = "saldo-pedido:";

/** Clave de idempotencia del cobro del saldo: uno por pedido (el árbitro de la base). */
export function claveDelSaldoDelPedido(orderId: string): string {
  return `${SALDO_PEDIDO_ACTOR_PREFIX}${orderId}`;
}

type DbCobros = Pick<Prisma.TransactionClient, "collection">;

/** Lo ya cobrado de un pedido por cobros parciales (0 si no tiene). */
export async function cobradoDelPedido(db: DbCobros, tenantId: string, orderId: string): Promise<number> {
  const filas = await db.collection.findMany({
    where: { tenantId, originType: "ORDER", originId: orderId },
    select: { amount: true },
  });
  return filas.reduce((s, f) => s + centavosDe(Number(f.amount)), 0) / 100;
}

/** Lo que hay que cobrarle HOY a un pedido sin cobrar: el total menos lo que ya pagó. */
export async function aCobrarDelPedido(db: DbCobros, tenantId: string, o: { id: string; total: number }): Promise<number> {
  return saldoDelPedido(o.total, [await cobradoDelPedido(db, tenantId, o.id)]);
}

/** Lo ya cobrado de varios pedidos, para una pantalla (una consulta). Sólo vienen los que tienen. */
export async function cobradoDeLosPedidos(db: DbCobros, tenantId: string, ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const filas = await db.collection.findMany({
    where: { tenantId, originType: "ORDER", originId: { in: [...ids] } },
    select: { originId: true, amount: true },
  });
  for (const f of filas) out.set(f.originId, ((centavosDe(out.get(f.originId) ?? 0) + centavosDe(Number(f.amount))) / 100));
  return out;
}

type TxSaldo = Pick<Prisma.TransactionClient, "collection" | "cashMovement" | "cashSession" | "$queryRawUnsafe">;

/**
 * Cobra el SALDO de un pedido dentro de la transacción del cobro (`cobrarPedidoEnTx`, con la fila
 * del pedido ya tomada por su compare-and-set): un cobro del pedido y, si el medio va al libro, su
 * VENTA colgada del cobro y enganchada al turno abierto. La frontera del día cerrado la mira el
 * llamador ANTES (setOrderPaidCore y el aviso de Mercado Pago ya lo hacen para todo cobro).
 */
export async function cobrarSaldoDelPedidoEnTx(
  tx: TxSaldo,
  tenantId: string,
  v: { orderId: string; orderCode: number; saldo: number; medio: string; actor: string },
): Promise<{ collectionId: string; asentado: boolean }> {
  const cobro = await tx.collection.create({
    data: {
      tenantId,
      originType: "ORDER",
      originId: v.orderId,
      orderId: v.orderId,
      amount: v.saldo,
      method: v.medio as Prisma.CollectionCreateInput["method"],
      note: `Pedido #${v.orderCode}: saldo por el peso real`,
      collectedBy: v.actor,
      idempotencyKey: claveDelSaldoDelPedido(v.orderId),
    },
    select: { id: true },
  });
  // El mismo criterio que el cobro de siempre (`cashSaleEligibility`): un medio que el libro no
  // conoce no se adivina; queda el cobro y no el asiento.
  const metodo = cashMethodFromPaymentMethod(v.medio, v.medio === "TRANSFERENCIA" && (await transferenciaEnElLibroTx(tx)));
  if (!metodo) return { collectionId: cobro.id, asentado: false };
  const turno = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: turno?.id ?? null,
      type: "VENTA",
      method: metodo,
      amount: v.saldo,
      reason: `Pedido #${v.orderCode} · saldo por el peso real · ${etiquetaDeMedio(v.medio)} ${fmtMoneyARS(v.saldo)}`,
      collectionId: cobro.id,
      createdBy: `${SALDO_PEDIDO_ACTOR_PREFIX}${v.actor}`,
    },
  });
  return { collectionId: cobro.id, asentado: true };
}
