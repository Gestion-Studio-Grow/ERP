// ============================================================================
// LECTURA de Movimientos de un producto — servidor, sin "use server".
// ============================================================================
//
// Sobre el registro de movimientos (StockMovement), que ya guarda el saldo después de cada
// uno, el motivo y el rastro al pedido o la compra (ledger.ts). La llama la página después de
// `requireApp("movimientos")`; pide `stock:read` y los costos sólo viajan con `costs:read`.
// Nunca sale del negocio: todos los `where` llevan `tenantId`.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { sumarDias } from "@/lib/stock/merma-core";
import { whereEnNegativo } from "@/lib/inventory/valuation";
import { usuarioDe, type FiltrosDeMovimientos } from "./movimientos";

/** Cuántos movimientos se muestran de una vez. */
export const MAX_FILAS = 200;

export async function getMovimientos(f: FiltrosDeMovimientos) {
  const user = await requireCapability("stock:read");
  const tenantId = await getCurrentTenantId();
  const conCostos = roleHasCapability(user.role, "costs:read");

  const createdAt =
    f.desde || f.hasta
      ? {
          ...(f.desde ? { gte: businessWallTimeToUtc(f.desde, "00:00") } : {}),
          ...(f.hasta ? { lt: businessWallTimeToUtc(sumarDias(f.hasta, 1), "00:00") } : {}),
        }
      : undefined;

  const [productos, negativos, filas] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, stock: true, active: true },
    }),
    prisma.product.findMany({
      where: whereEnNegativo(tenantId),
      orderBy: { stock: "asc" },
      select: { id: true, name: true, unit: true, stock: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...(f.producto ? { productId: f.producto } : {}),
        ...(f.tipo ? { type: f.tipo } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: MAX_FILAS + 1,
      select: {
        id: true,
        productId: true,
        type: true,
        qty: true,
        unitCost: true,
        balanceAfter: true,
        reason: true,
        orderId: true,
        purchaseId: true,
        createdBy: true,
        createdAt: true,
        product: { select: { name: true, unit: true } },
      },
    }),
  ]);
  const hayMas = filas.length > MAX_FILAS;
  const movimientos = hayMas ? filas.slice(0, MAX_FILAS) : filas;

  // Los nombres de quién y los números de pedido y compra, en tres lecturas por lote (no una
  // por fila).
  const userIds = [...new Set(movimientos.flatMap((m) => usuarioDe(m.createdBy) ?? []))];
  const orderIds = [...new Set(movimientos.flatMap((m) => m.orderId ?? []))];
  const purchaseIds = [...new Set(movimientos.flatMap((m) => m.purchaseId ?? []))];
  const [usuarios, pedidos, compras] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, name: true } }) : [],
    orderIds.length ? prisma.order.findMany({ where: { tenantId, id: { in: orderIds } }, select: { id: true, code: true } }) : [],
    purchaseIds.length
      ? prisma.stockPurchase.findMany({ where: { tenantId, id: { in: purchaseIds } }, select: { id: true, code: true } })
      : [],
  ]);

  return {
    conCostos,
    productos,
    negativos,
    hayMas,
    nombres: new Map(usuarios.map((u) => [u.id, u.name])),
    pedidos: new Map(pedidos.map((o) => [o.id, o.code])),
    compras: new Map(compras.map((c) => [c.id, c.code])),
    movimientos: movimientos.map((m) => (conCostos ? m : { ...m, unitCost: null })),
  };
}
