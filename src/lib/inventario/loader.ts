// ============================================================================
// Loader de Inventario (niveles + valuación) — cableado al read model de S1.
// ============================================================================
//
// Mapea el read model de S1 (`@/lib/inventory/inventory-loader.getInventoryValuation`,
// sobre `Product` + último costo de `StockPurchaseItem`) al CONTRATO DE VISTA de la UI
// (`./valuation`), para que la pantalla no cambie. S1 ya guarda `catalog:read` y computa la
// valuación; acá solo se re-nombra a `productId/valuation/belowLowStock/sinCosto`. Read-only.

import { getInventoryValuation } from "@/lib/inventory/inventory-loader";
import type { InventoryRow, InventorySummary } from "./valuation";

export interface InventoryReport {
  rows: InventoryRow[];
  summary: InventorySummary;
}

export async function getInventory(): Promise<InventoryReport> {
  const val = await getInventoryValuation(); // guarda catalog:read + scopea por tenant
  return {
    rows: val.rows.map((r) => ({
      productId: r.id,
      name: r.name,
      unit: r.unit,
      stock: r.stock,
      unitCost: r.unitCost ?? 0,
      valuation: r.stockValue,
      belowLowStock: r.lowStock,
      sinCosto: !r.valued,
    })),
    summary: {
      productos: val.summary.productCount,
      valuacionTotal: val.summary.totalValue,
      bajoStock: val.summary.lowStockCount,
      sinCosto: val.summary.unvaluedCount,
    },
  };
}
