// ============================================================================
// CONTRATO DE VISTA de Stock (niveles + valuación). PURO.
// ============================================================================
//
// La pantalla de Stock lee esta forma (components/inventario/InventoryTable también la tipa,
// aunque la pantalla ya no la usa: muestra todo por góndola). El cálculo NO vive acá: lo hace
// `computeStockValuation` (inventory/valuation.ts) con el costo vigente (stock/costo.ts) y la
// ÚNICA definición de "stock bajo" (`esStockBajo`).
// Antes este archivo tenía su propia valuación y su propio "stock bajo" (stock ≤ umbral, sin
// mirar si el producto controla existencias): una tercera verdad que nadie usaba en la
// pantalla y que los tests sostenían. Acá sólo se re-nombra al contrato de la vista.

import type { StockLevelRow, StockValuationSummary } from "@/lib/inventory/valuation";

export interface InventoryRow {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  /** Costo unitario usado para valuar (0 si no se conoce o si quien mira no ve costos). */
  unitCost: number;
  /** Valuación = stock × unitCost, redondeada. */
  valuation: number;
  /** Bajo el mínimo (`esStockBajo`). */
  belowLowStock: boolean;
  /** En negativo (`estaEnNegativo`): hay que recontarlo. */
  negative: boolean;
  /** true si no hay costo conocido → la valuación es 0 y hay que marcarlo. */
  sinCosto: boolean;
}

export interface InventorySummary {
  productos: number;
  /** Valuación total del inventario (suma de las filas). */
  valuacionTotal: number;
  /** Cuántos productos están bajo el mínimo. */
  bajoStock: number;
  /** Cuántos tienen stock y no tienen costo conocido (valuación incompleta). */
  sinCosto: number;
  /** Cuántos están en negativo. */
  enNegativo: number;
}

/** Fila del read model → fila de la vista. PURA. */
export function aFilaDeInventario(r: StockLevelRow): InventoryRow {
  return {
    productId: r.id,
    name: r.name,
    unit: r.unit,
    stock: r.stock,
    unitCost: r.unitCost ?? 0,
    valuation: r.stockValue,
    belowLowStock: r.lowStock,
    negative: r.negative,
    sinCosto: !r.valued,
  };
}

/** Resumen del read model → resumen de la vista. PURA. */
export function aResumenDeInventario(s: StockValuationSummary): InventorySummary {
  return {
    productos: s.productCount,
    valuacionTotal: s.totalValue,
    bajoStock: s.lowStockCount,
    sinCosto: s.unvaluedCount,
    enNegativo: s.negativeCount,
  };
}
