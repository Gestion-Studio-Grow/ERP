// ============================================================================
// INVENTARIO LIGHT (D5) — loader SERVER (Prisma → tipos). ADR-060.
// ============================================================================
//
// Gemelo server de `./valuation.ts` (puro). Lee, por tenant: los productos activos con su
// stock actual + el ÚLTIMO costo de compra conocido de cada uno (`StockPurchaseItem.unitCost`
// más reciente > 0, mismo criterio que el reporte de margen 16T). Read-only, SIN schema nuevo,
// sin escribir nada. Guard `catalog:read` (ver la mercadería/stock es parte del catálogo).
//
// Rubro-gated de hecho: un tenant de servicios sin productos con stock devuelve filas vacías
// → la pantalla no muestra la sección de inventario.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { computeStockValuation, type StockValuation } from "./valuation";

/**
 * Arma el read model de inventario del tenant actual: niveles de stock + valuación a costo.
 * Deriva el costo del último `StockPurchaseItem` (>0) por producto. No toca schema ni escribe.
 */
export async function getInventoryValuation(): Promise<StockValuation> {
  await requireCapability("catalog:read");
  const tenantId = await getCurrentTenantId();

  const [products, costItems] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { id: true, name: true, unit: true, stock: true, lowStockAt: true },
      orderBy: { name: "asc" },
    }),
    // Últimos costos de compra conocidos (unitCost > 0), del más reciente al más viejo.
    // El primero que aparezca por producto = su costo vigente (mismo patrón que margin-loader).
    prisma.stockPurchaseItem.findMany({
      where: { tenantId, productId: { not: null }, unitCost: { gt: 0 } },
      orderBy: { purchase: { createdAt: "desc" } },
      select: { productId: true, unitCost: true },
    }),
  ]);

  const costByProduct: Record<string, number> = {};
  for (const it of costItems) {
    if (it.productId && !(it.productId in costByProduct)) {
      costByProduct[it.productId] = it.unitCost;
    }
  }

  return computeStockValuation(products, costByProduct);
}
