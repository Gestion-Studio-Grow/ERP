// LECTURA del Reporte de la carnicería (bloque a) — servidor, sin "use server". La llama la
// página después de `requireApp("reportes")`, con el negocio ya resuelto. Una operación por
// mes: `groupBy` de los renglones POR PESO de los pedidos no anulados, con el `tenantId` en el
// renglón y en el pedido (whereRenglonesPorPeso). No toca tablas de la migración cárnica: se
// muestra aunque falte.

import type { Prisma } from "@/generated/prisma/client";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { whereRenglonesPorPeso, type KilosVendidos, type RangoDeDias } from "./reporte-rubro";

export async function leerKilosVendidos(db: Prisma.TransactionClient, tenantId: string, rango: RangoDeDias): Promise<KilosVendidos[]> {
  const desde = businessWallTimeToUtc(rango.desde, "00:00");
  const hasta = businessWallTimeToUtc(rango.hasta, "00:00");
  const grupos = await db.orderItem.groupBy({
    by: ["productId", "name"],
    where: whereRenglonesPorPeso(tenantId, desde, hasta),
    _sum: { quantity: true },
  });
  return grupos.map((g) => ({ productId: g.productId, name: g.name, kg: Number(g._sum.quantity ?? 0) }));
}
