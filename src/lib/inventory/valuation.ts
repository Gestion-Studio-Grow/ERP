// ============================================================================
// INVENTARIO LIGHT (D5, ADR-060) — valuación de existencias, cálculo PURO.
// ============================================================================
//
// Versión LIGHT, SIN schema nuevo: un read model de "qué tengo y cuánto vale", derivado del
// stock que ya existe (`Product.stock`) y del último costo de compra conocido
// (`StockPurchaseItem.unitCost`, igual que el reporte de margen 16T). El recuento físico
// formal (StockCount) queda en reserva; esto cubre el mínimo: niveles + valuación + faltantes.
//
// Money cent-safe (round2). Un producto sin costo conocido se lista igual (su nivel importa),
// pero no suma a la valuación (no se puede valuar sin costo).

import { round2 } from "@/lib/round";

export interface StockProductInput {
  id: string;
  name: string;
  unit: string; // "unidades", "kg", …
  stock: number;
  lowStockAt: number;
}

export interface StockLevelRow {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  /** Costo unitario conocido (último de compra), o null si no hay. */
  unitCost: number | null;
  /** Valor del stock a costo (stock × unitCost), 0 si no hay costo. */
  stockValue: number;
  /** true si stock ≤ umbral → conviene reponer. */
  lowStock: boolean;
  /** true si se pudo valuar (hay costo conocido). */
  valued: boolean;
}

export interface StockValuationSummary {
  /** Cantidad de productos listados. */
  productCount: number;
  /** Valor total del inventario a costo (suma de los valuados). */
  totalValue: number;
  /** Cuántos productos están en o bajo su umbral de reposición. */
  lowStockCount: number;
  /** Cuántos no se pudieron valuar (sin costo conocido). */
  unvaluedCount: number;
}

export interface StockValuation {
  rows: StockLevelRow[];
  summary: StockValuationSummary;
}

/**
 * Computa niveles + valuación de stock. PURA. Ordena por valor de stock descendente (lo que
 * más plata inmoviliza, primero). `costByProduct` mapea productId → último costo unitario.
 */
export function computeStockValuation(
  products: readonly StockProductInput[],
  costByProduct: Readonly<Record<string, number>>,
): StockValuation {
  const rows: StockLevelRow[] = products.map((p) => {
    const rawCost = costByProduct[p.id];
    const unitCost = rawCost && rawCost > 0 ? rawCost : null;
    const stockValue = unitCost != null ? round2(p.stock * unitCost) : 0;
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      lowStockAt: p.lowStockAt,
      unitCost,
      stockValue,
      lowStock: p.stock <= p.lowStockAt,
      valued: unitCost != null,
    };
  });

  rows.sort((a, b) => b.stockValue - a.stockValue);

  const summary: StockValuationSummary = {
    productCount: rows.length,
    totalValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
    lowStockCount: rows.filter((r) => r.lowStock).length,
    unvaluedCount: rows.filter((r) => !r.valued).length,
  };
  return { rows, summary };
}
