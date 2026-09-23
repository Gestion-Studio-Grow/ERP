// ============================================================================
// Loader SERVER del reporte de margen (16T) — arma `costByProduct` y computa.
// ============================================================================
//
// Gemelo server de `./margin.ts` (puro). Lee, por negocio: los productos activos con su
// precio de venta y su COSTO VIGENTE (src/lib/stock/costo.ts): el del catálogo si está, si no
// el último ingreso con costo, despiece incluido. Es el mismo número que muestran Stock y el
// Catálogo; antes el margen sólo miraba la última compra y los cortes de un despiece salían
// "sin margen". Guard `reports:read` (mismo que el resto de Reportes). Read-only.
//
// Reversible/rubro-gated de hecho: si el negocio no tiene productos con precio Y costo
// (p. ej. un spa de servicios), devuelve filas vacías → la pantalla no renderiza la sección.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { leerCostosDelCatalogo } from "@/lib/inventory/inventory-loader";
import { whereProductosDeStock } from "@/lib/inventory/valuation";
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

  const [products, catalogo] = await Promise.all([
    prisma.product.findMany({
      where: whereProductosDeStock(tenantId),
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, ...SELECT_INGRESOS },
    }),
    leerCostosDelCatalogo(tenantId),
  ]);

  const costos = costosVigentesDe(products, catalogo);
  const costByProduct: Record<string, number> = {};
  for (const [id, c] of Object.entries(costos)) if (c != null) costByProduct[id] = c;

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
