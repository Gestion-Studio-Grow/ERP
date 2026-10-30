// DOBLE SALIDA (UAT M1, orden del dueño 30/10/2026): una devolución cargada A MANO en el libro y la
// ANULACIÓN de la misma venta sacan la misma plata dos veces. Pasa en los dos órdenes:
//   · se anula la venta (el sistema asienta su egreso, `anulacion-venta:`) y después alguien carga
//     la devolución en «Cargar un gasto o retiro»;
//   · se carga la devolución a mano (el día estaba cerrado, o por costumbre) y después se anula.
// No hay un vínculo guardado entre la fila manual y la venta: se compara lo que sí se puede
// (egreso, mismo monto, fechas que encajan). Por eso AVISA y pide confirmar, nunca bloquea: dos
// egresos iguales pueden ser legítimos.
import type { Prisma } from "@/generated/prisma/client";
import { ANULACION_VENTA_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { fmtMoneyARS } from "@/components/ui/format";
import { dateStrInBusinessTz } from "@/lib/datetime";
import type { CashMethod } from "@/lib/caja/cash-register";

type Db = Pick<Prisma.TransactionClient, "cashMovement" | "order">;

/** Ventana hacia atrás para buscar la anulación de una devolución que se carga a mano. */
export const DIAS_DE_VENTANA = 30;
/** Lo que deja `addLibroEntry` en `createdBy`: los egresos tipeados a mano. */
const PREFIJO_MANUAL = "user:";

export type EgresoParecido = { detalle: string; monto: number; medio: CashMethod; dia: string };

const diaCorto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * Al cargar un EGRESO a mano: ¿hay una anulación de venta por el mismo monto en los últimos
 * `DIAS_DE_VENTANA` días (o el mismo día)? Cualquier medio: la devolución puede ir por otro. Una
 * venta con pago mixto se anula con una contrapartida POR MEDIO (mismo detalle): se suman.
 */
export async function anulacionDelMismoMonto(db: Db, tenantId: string, monto: number, fecha: Date): Promise<EgresoParecido | null> {
  const desde = new Date(fecha.getTime() - DIAS_DE_VENTANA * 86_400_000);
  const hasta = new Date(fecha.getTime() + 86_400_000);
  const filas = await db.cashMovement.findMany({
    where: { tenantId, type: "EGRESO", amount: { lte: monto }, createdBy: { startsWith: ANULACION_VENTA_ACTOR_PREFIX }, occurredAt: { gte: desde, lt: hasta } },
    orderBy: { occurredAt: "desc" },
    select: { reason: true, amount: true, method: true, occurredAt: true },
    take: 500,
  });
  const porVenta = new Map<string, typeof filas>();
  for (const f of filas) porVenta.set(f.reason ?? "", [...(porVenta.get(f.reason ?? "") ?? []), f]);
  for (const [detalle, grupo] of porVenta) {
    const total = grupo.reduce((s, f) => s + Number(f.amount), 0);
    const igual = grupo.find((f) => Number(f.amount) === monto);
    if (igual || Math.abs(total - monto) < 0.005) {
      const f = igual ?? grupo[0];
      return { detalle, monto: igual ? Number(f.amount) : total, medio: f.method as CashMethod, dia: dateStrInBusinessTz(f.occurredAt) };
    }
  }
  return null;
}

/**
 * Al anular una venta COBRADA: ¿hay un egreso cargado a mano, por lo mismo que entró de esa venta
 * a la caja, desde el día en que se cobró? `null` si la venta no entró a la caja.
 */
export async function devolucionManualDeLaVenta(db: Db, tenantId: string, orderId: string): Promise<EgresoParecido | null> {
  // Ya anulada: no hay nada que preguntar (la anulación responde «ya estaba anulada»).
  const venta = await db.order.findFirst({ where: { tenantId, id: orderId }, select: { status: true } });
  if (!venta || venta.status === "CANCELLED") return null;
  // El pago mixto asienta un movimiento por medio, colgado del cobro (`collectionId`), no del pedido.
  const cobros = await db.cashMovement.findMany({
    where: { tenantId, type: "VENTA", OR: [{ orderId }, { collection: { is: { orderId } } }] },
    select: { amount: true, occurredAt: true },
  });
  if (cobros.length === 0) return null;
  const montos = [...new Set([...cobros.map((c) => Number(c.amount)), cobros.reduce((s, c) => s + Number(c.amount), 0)])];
  const desde = cobros.reduce((d, c) => (c.occurredAt < d ? c.occurredAt : d), cobros[0].occurredAt);
  const desdeElDia = new Date(desde.getTime() - 86_400_000);
  const fila = await db.cashMovement.findFirst({
    where: { tenantId, type: "EGRESO", amount: { in: montos }, createdBy: { startsWith: PREFIJO_MANUAL }, occurredAt: { gte: desdeElDia } },
    orderBy: { occurredAt: "desc" },
    select: { reason: true, amount: true, method: true, occurredAt: true },
  });
  if (!fila || dateStrInBusinessTz(fila.occurredAt) < dateStrInBusinessTz(desde)) return null;
  return { detalle: fila.reason ?? "", monto: Number(fila.amount), medio: fila.method as CashMethod, dia: dateStrInBusinessTz(fila.occurredAt) };
}

/** El aviso al cargar la devolución a mano después de anular. PURA. */
export function avisoDevolucionYaAnulada(e: EgresoParecido): string {
  return (
    `El ${diaCorto(e.dia)} se anuló una venta por el mismo monto y el sistema ya sacó ${fmtMoneyARS(e.monto)} ` +
    `(${CASH_METHOD_LABEL[e.medio]}) del libro: “${e.detalle}”. Si esta devolución es de esa venta, la plata ` +
    `saldría dos veces. Si es otra, confirmá para guardarla igual.`
  );
}

/** El aviso al anular una venta que ya tiene una devolución cargada a mano. PURA. */
export function avisoAnulacionConDevolucion(e: EgresoParecido): string {
  return (
    `El ${diaCorto(e.dia)} se cargó a mano un egreso de ${fmtMoneyARS(e.monto)} (${CASH_METHOD_LABEL[e.medio]}): ` +
    `“${e.detalle}”. Si era la devolución de esta venta, al anularla la plata sale dos veces de la caja. ` +
    `Si es otra cosa, confirmá para anular igual.`
  );
}
