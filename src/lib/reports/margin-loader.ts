// ============================================================================
// Loader SERVER del reporte de margen (16T) — arma `costByProduct` y computa.
// ============================================================================
//
// Gemelo server de `./margin.ts` (puro). Lee, por tenant: los productos activos con su
// precio de venta y el ÚLTIMO costo de compra conocido de cada uno
// (`StockPurchaseItem.unitCost` más reciente > 0). Guard `reports:read` (mismo que el
// resto de Reportes). Read-only, sin escribir nada.
//
// Reversible/rubro-gated de hecho: si el tenant no tiene productos con precio Y costo
// (p. ej. un spa de servicios), devuelve filas vacías → la pantalla no renderiza la
// sección. NO toca schema ni Neon (solo lectura).

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import {
  computeProductMargins,
  summarizeMargins,
  type MarginRow,
  type MarginSummary,
  type SaleUnit,
} from "./margin";

export interface MarginReport {
  rows: MarginRow[];
  summary: MarginSummary;
}

export async function getMarginReport(): Promise<MarginReport> {
  await requireCapability("reports:read");
  const tenantId = await getCurrentTenantId();

  const [products, costItems] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
    }),
    // Últimos costos de compra conocidos (unitCost > 0), del más reciente al más viejo.
    // El primero que aparezca por producto = su costo vigente.
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

  const rows = computeProductMargins(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      saleUnit: p.saleUnit as SaleUnit,
      price: p.price,
      pricePerKg: p.pricePerKg,
    })),
    costByProduct,
  );
  return { rows, summary: summarizeMargins(rows) };
}
