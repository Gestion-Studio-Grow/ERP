// ============================================================================
// VALUACIÓN de inventario (stock actual × costo) — ADR-060 D5 (vista read-only). PURO.
// ============================================================================
//
// La pantalla de Inventario es READ-ONLY: niveles de stock actuales + su valuación por
// producto (cuánto vale la mercadería que hay). La valuación = stock × último costo de
// compra conocido (`StockPurchaseItem.unitCost`, mismo criterio que el margen de Reportes).
// Sin schema nuevo. Este módulo solo hace la aritmética (testeable sin DB); el read model
// (niveles + costo) lo aporta S1 y el loader lo mapea a este contrato.

import { round2 } from "@/lib/round";

export interface InventoryInput {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  /** Último costo de compra conocido; `null` si el producto nunca se compró con costo. */
  unitCost: number | null;
  /** Umbral de stock bajo del producto. */
  lowStockAt: number;
}

export interface InventoryRow {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  /** Costo unitario usado para valuar (0 si no se conoce). */
  unitCost: number;
  /** Valuación = stock × unitCost, redondeada. */
  valuation: number;
  /** true si stock ≤ umbral (para el semáforo de stock bajo). */
  belowLowStock: boolean;
  /** true si no hay costo conocido → la valuación es 0 y hay que marcarlo. */
  sinCosto: boolean;
}

/** Mapea un input del read model a una fila valuada. PURA. */
export function toInventoryRow(p: InventoryInput): InventoryRow {
  const unitCost = p.unitCost != null && p.unitCost > 0 ? p.unitCost : 0;
  return {
    productId: p.productId,
    name: p.name,
    unit: p.unit,
    stock: p.stock,
    unitCost,
    valuation: round2(p.stock * unitCost),
    belowLowStock: p.stock <= p.lowStockAt,
    sinCosto: unitCost === 0,
  };
}

export interface InventorySummary {
  productos: number;
  /** Valuación total del inventario (suma de las filas). */
  valuacionTotal: number;
  /** Cuántos productos están en/por debajo del stock bajo. */
  bajoStock: number;
  /** Cuántos no tienen costo conocido (valuación incompleta). */
  sinCosto: number;
}

/** Arma las filas valuadas + el resumen a partir del read model. PURA. */
export function buildInventory(inputs: readonly InventoryInput[]): { rows: InventoryRow[]; summary: InventorySummary } {
  const rows = inputs.map(toInventoryRow);
  const summary: InventorySummary = {
    productos: rows.length,
    valuacionTotal: round2(rows.reduce((s, r) => s + r.valuation, 0)),
    bajoStock: rows.filter((r) => r.belowLowStock).length,
    sinCosto: rows.filter((r) => r.sinCosto).length,
  };
  return { rows, summary };
}
