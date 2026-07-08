// ============================================================================
// RENTABILIDAD / MARGEN por producto (16T) — cálculo PURO.
// ============================================================================
//
// Profundización Empresa de Reportes (P1.b del set mínimo): al reporte de INGRESOS
// (bruto) se le suma la lectura de MARGEN — cuánto deja cada producto. Es ADITIVO sobre
// la MISMA pantalla (`/admin/reportes`), no una pantalla nueva.
//
// ⚠️ SIN cambio de schema (no toca Neon). El precio de venta ya vive en `Product`
// (`price` por unidad / `pricePerKg` por kilo); el costo se toma del ÚLTIMO costo de
// compra conocido (`StockPurchaseItem.unitCost` más reciente > 0). El loader arma
// `costByProduct`; este módulo solo hace la aritmética, testeable sin DB.
//
// Gating por RUBRO natural + por DATO: solo tienen margen los productos con precio Y
// costo. Un tenant de servicios (spa) sin productos con costo → sin filas → la sección
// no se renderiza (rubro-gated de hecho). Empresa/perfil lo decide la pantalla.

export type SaleUnit = "UNIT" | "WEIGHT";

export interface MarginProductInput {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  /** Precio de venta por unidad (saleUnit=UNIT). */
  price: number | null;
  /** Precio de venta por kilo (saleUnit=WEIGHT). */
  pricePerKg: number | null;
}

export interface MarginRow {
  id: string;
  name: string;
  /** "u." o "kg" según cómo se vende. */
  unitLabel: string;
  price: number;
  cost: number;
  /** Margen bruto por unidad vendida (precio − costo). Puede ser negativo (vende a pérdida). */
  margin: number;
  /** Margen sobre precio (margin/price), en fracción [.. ]. Negativo si vende a pérdida. */
  marginPct: number;
}

/**
 * Calcula el margen por producto para los que tienen precio de venta Y costo conocido.
 * Ordena por margen % descendente (lo más rentable primero). PURA — no muta las entradas.
 * Los productos sin precio o sin costo se OMITEN (no se puede calcular margen sin ambos).
 */
export function computeProductMargins(
  products: readonly MarginProductInput[],
  costByProduct: Readonly<Record<string, number>>,
): MarginRow[] {
  const rows: MarginRow[] = [];
  for (const p of products) {
    const price = p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
    const cost = costByProduct[p.id];
    if (!price || price <= 0 || !cost || cost <= 0) continue;
    const margin = price - cost;
    rows.push({
      id: p.id,
      name: p.name,
      unitLabel: p.saleUnit === "WEIGHT" ? "kg" : "u.",
      price,
      cost,
      margin,
      marginPct: margin / price,
    });
  }
  return rows.sort((a, b) => b.marginPct - a.marginPct);
}

/** Resumen del panel de margen: promedio ponderado por... nada aún — margen % simple promedio. */
export interface MarginSummary {
  /** Cantidad de productos con margen calculable. */
  count: number;
  /** Margen % promedio (simple) sobre los productos con margen. 0 si no hay ninguno. */
  avgMarginPct: number;
  /** Cuántos venden a pérdida (margen < 0) — foco de atención. */
  belowCostCount: number;
}

/** Resumen agregado de las filas de margen. PURA. */
export function summarizeMargins(rows: readonly MarginRow[]): MarginSummary {
  if (rows.length === 0) return { count: 0, avgMarginPct: 0, belowCostCount: 0 };
  const sum = rows.reduce((s, r) => s + r.marginPct, 0);
  const belowCostCount = rows.filter((r) => r.margin < 0).length;
  return { count: rows.length, avgMarginPct: sum / rows.length, belowCostCount };
}
