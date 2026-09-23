// ============================================================================
// LECTURA de las ventas cobradas del mostrador en el período de Reportes.
// ============================================================================
//
// La misma para la pantalla de Reportes de un local de mostrador, su exportación y el botón
// del Inicio. El `where` es el de Ventas del día (`whereVentasCobradas`: cobradas, no
// anuladas, por fecha de creación), con los bordes de día del período de Reportes
// (`bordesDelPeriodo`). Sin "use server" ni "server-only" (ver debts/cuentas-lectura.ts).

import type { Prisma } from "@/generated/prisma/client";
import { whereVentasCobradas } from "@/lib/order-anulacion";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import { bordesDelPeriodo } from "@/lib/report-ingresos";
import { aNumero } from "@/lib/debts/resumen-cuentas";
import { esTablaFaltante } from "@/lib/debts/cuentas-lectura";
import { agruparVentasMostrador, type ReporteMostrador } from "./ventas-mostrador";

/**
 * El `where` de las ventas cobradas de los últimos `dias` días contando hoy. `bordesDelPeriodo`
 * da el último instante del período INCLUIDO (23:59:59,999); `whereVentasCobradas` corta con
 * "menor que", así que se le pasa el milisegundo siguiente: la medianoche.
 */
export function whereVentasDelPeriodo(tenantId: string, hoy: string, dias: number) {
  const { desde, hasta } = bordesDelPeriodo(hoy, dias, businessWallTimeToUtc);
  return { where: whereVentasCobradas(tenantId, desde, new Date(hasta.getTime() + 1)), desde, hasta };
}

/**
 * Las ventas del período con lo justo para agruparlas. Tres lecturas, ninguna con ítems por
 * venta (un año de un mostrador son decenas de miles de líneas):
 *   · las ventas: fecha, total y medio;
 *   · sus líneas, sumadas por la base por producto (`groupBy` con el mismo `where` del pedido);
 *   · entre las que no tienen medio, cuáles quedaron a cuenta del cliente (su cuenta a cobrar
 *     lleva el id del pedido): Vender las graba saldadas y sin medio. Sólo si hay alguna.
 */
export async function leerVentasMostrador(
  db: Prisma.TransactionClient,
  tenantId: string,
  hoy: string,
  dias: number,
): Promise<ReporteMostrador & { desde: Date; hasta: Date }> {
  const { where, desde, hasta } = whereVentasDelPeriodo(tenantId, hoy, dias);
  const [ventas, lineas] = await Promise.all([
    db.order.findMany({ where, select: { id: true, createdAt: true, total: true, paymentMethod: true } }),
    db.orderItem.groupBy({
      by: ["productId", "name", "saleUnit"],
      where: { tenantId, order: where },
      _sum: { quantity: true, lineTotal: true },
    }),
  ]);
  const sinMedio = ventas.filter((v) => v.paymentMethod == null).map((v) => v.id);
  const aCuenta = new Set<string>();
  if (sinMedio.length > 0) {
    const cuentas = await db.accountReceivable
      .findMany({ where: { tenantId, orderId: { in: sinMedio } }, select: { orderId: true } })
      .catch((e: unknown) => {
        // Sin la tabla de cuentas corrientes no hay ventas a cuenta: quedan "sin medio".
        if (esTablaFaltante(e)) return [] as { orderId: string | null }[];
        throw e;
      });
    for (const c of cuentas) if (c.orderId) aCuenta.add(c.orderId);
  }
  const r = agruparVentasMostrador(
    ventas.map((v) => ({
      createdAt: v.createdAt,
      total: aNumero(v.total),
      paymentMethod: v.paymentMethod,
      aCuenta: aCuenta.has(v.id),
      items: [],
    })),
    dateStrInBusinessTz,
    lineas.map((l) => ({
      productId: l.productId,
      name: l.name,
      quantity: aNumero(l._sum?.quantity),
      saleUnit: l.saleUnit === "WEIGHT" ? ("WEIGHT" as const) : ("UNIT" as const),
      lineTotal: aNumero(l._sum?.lineTotal),
    })),
  );
  return { ...r, desde, hasta };
}
