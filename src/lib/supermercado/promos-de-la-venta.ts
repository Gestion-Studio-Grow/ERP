// ============================================================================
// LAS PROMOS DE UNA VENTA — lo que el ticket muestra ("2×1 Coca-Cola −$4.600").
// ============================================================================
//
// El descuento de cada promo ya está en el `lineTotal` de su renglón (order-core.ts). Qué promo
// fue y cuánto descontó se guarda en UNA fila de auditoría de la venta, en la misma transacción
// del alta: el ticket reimpreso y Ventas del día la leen de ahí. Sin promos, no se escribe nada.

import type { Prisma } from "@/generated/prisma/client";
import { ACCION_PROMOS_DE_LA_VENTA } from "./marcas";
import type { PromosDeLaVenta } from "@/lib/order-core";

export async function registrarPromocionesDeLaVentaEnTx(
  tx: Prisma.TransactionClient,
  d: { tenantId: string; orderId: string; promos: PromosDeLaVenta | undefined },
): Promise<void> {
  if (!d.promos || d.promos.aplicadas.length === 0) return;
  await tx.auditLog.create({
    data: {
      tenantId: d.tenantId,
      actor: "system",
      action: ACCION_PROMOS_DE_LA_VENTA,
      entity: "Order",
      entityId: d.orderId,
      changes: d.promos as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Al pesar y ajustar un pedido: las promos que quedaron reemplazan a las anteriores (manda la
 * última fila). Si antes había y ya no queda ninguna, se deja una fila vacía, para que el ticket no
 * muestre un ahorro que el total ya no tiene.
 */
export async function reemplazarPromocionesDeLaVentaEnTx(
  tx: Prisma.TransactionClient,
  d: { tenantId: string; orderId: string; promos: PromosDeLaVenta | null },
): Promise<void> {
  if (d.promos && d.promos.aplicadas.length > 0) return registrarPromocionesDeLaVentaEnTx(tx, { ...d, promos: d.promos });
  const anterior = await tx.auditLog.findFirst({
    where: wherePromosDeLaVenta(d.tenantId, d.orderId),
    orderBy: { createdAt: "desc" },
    select: { changes: true },
  });
  if (promosDelTicket(anterior?.changes).length === 0) return;
  const vacia: PromosDeLaVenta = { aplicadas: [], renglones: [] };
  await tx.auditLog.create({
    data: {
      tenantId: d.tenantId,
      actor: "system",
      action: ACCION_PROMOS_DE_LA_VENTA,
      entity: "Order",
      entityId: d.orderId,
      changes: vacia as unknown as Prisma.InputJsonValue,
    },
  });
}

/** El `where` de la fila de promos de una venta. */
export function wherePromosDeLaVenta(tenantId: string, orderId: string) {
  return { tenantId, entity: "Order", entityId: orderId, action: ACCION_PROMOS_DE_LA_VENTA };
}

export type PromoEnTicket = { nombre: string; descuento: number };

/** Lee la fila (o nada) y devuelve las promos con su descuento. No confía en la forma. PURA. */
export function promosDelTicket(changes: unknown): PromoEnTicket[] {
  if (!changes || typeof changes !== "object") return [];
  const aplicadas = (changes as { aplicadas?: unknown }).aplicadas;
  if (!Array.isArray(aplicadas)) return [];
  return aplicadas.flatMap((a) => {
    const o = a as { nombre?: unknown; descuento?: unknown };
    return typeof o.nombre === "string" && typeof o.descuento === "number" && o.descuento > 0 ? [{ nombre: o.nombre, descuento: o.descuento }] : [];
  });
}
