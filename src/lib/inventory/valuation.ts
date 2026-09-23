// ============================================================================
// INVENTARIO LIGHT (D5, ADR-060) — valuación de existencias, cálculo PURO.
// ============================================================================
//
// Versión LIGHT, SIN schema nuevo: un read model de "qué tengo y cuánto vale", derivado del
// stock que ya existe (`Product.stock`) y del COSTO VIGENTE de cada producto (src/lib/stock/
// costo.ts: el costo del catálogo si está, si no el último ingreso con costo). El recuento
// físico formal (StockCount) queda en reserva; esto cubre el mínimo: niveles + valuación +
// faltantes.
//
// Money cent-safe (round2). Un producto sin costo conocido se lista igual (su nivel importa),
// pero no suma a la valuación (no se puede valuar sin costo).
//
// "STOCK BAJO" TIENE UNA SOLA DEFINICIÓN, ACÁ (`esStockBajo`). Había tres: el Inicio de
// mostrador filtraba `trackStock` (actions.ts), Compras e Inventario no. Un producto que no
// controla existencias (un insumo que nadie cuenta, un servicio) no puede estar "bajo": su
// número de stock no significa nada. Lo mismo para "en negativo" (`estaEnNegativo`).

import { round2 } from "@/lib/round";

export interface StockProductInput {
  id: string;
  name: string;
  unit: string; // "unidades", "kg", …
  stock: number;
  lowStockAt: number;
  /** ¿Controla existencias? Sin esto, ni "bajo" ni "negativo" significan nada. */
  trackStock: boolean;
}

/** Lo mínimo para decidir si un producto está bajo el mínimo o en negativo. */
export type NivelDeStock = { trackStock: boolean; stock: number; lowStockAt: number };

/** Stock bajo = controla existencias y está en el mínimo o por debajo. PURA. */
export function esStockBajo(p: NivelDeStock): boolean {
  return p.trackStock && p.stock <= p.lowStockAt;
}

/**
 * En negativo = controla existencias y el stock quedó bajo cero: se vendió más de lo que el
 * sistema creía que había (la regla MAG-4 deja vender por peso aunque falte). Hay que
 * recontarlo. PURA.
 */
export function estaEnNegativo(p: Pick<NivelDeStock, "trackStock" | "stock">): boolean {
  return p.trackStock && p.stock < 0;
}

/**
 * El mismo filtro, para la base: la cola "en negativo" de Movimientos y el número de su botón
 * cuentan con ESTE where (un objeto plano, sin importar Prisma).
 */
export function whereEnNegativo(tenantId: string) {
  return { tenantId, deletedAt: null, active: true, trackStock: true, stock: { lt: 0 } };
}

/** Los productos que lista la pantalla de Stock: activos y no borrados del negocio. */
export function whereProductosDeStock(tenantId: string) {
  return { tenantId, deletedAt: null, active: true };
}

export interface StockLevelRow {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  trackStock: boolean;
  /** Costo vigente, o null si no hay (o si quien mira no puede ver costos). */
  unitCost: number | null;
  /** Valor del stock a costo (stock × unitCost), 0 si no hay costo o el stock es ≤ 0. */
  stockValue: number;
  /** true si está bajo el mínimo (`esStockBajo`) → conviene reponer. */
  lowStock: boolean;
  /** true si está en negativo (`estaEnNegativo`) → hay que recontarlo. */
  negative: boolean;
  /** true si se pudo valuar (hay costo conocido). */
  valued: boolean;
}

export interface StockValuationSummary {
  /** Cantidad de productos listados. */
  productCount: number;
  /** Valor total del inventario a costo (suma de los valuados). */
  totalValue: number;
  /** Cuántos productos están bajo el mínimo (`esStockBajo`). */
  lowStockCount: number;
  /**
   * Cuántos tienen stock y no se pudieron valuar (sin costo conocido). Un producto sin stock
   * y sin costo no deja la valuación incompleta: no hay nada que valuar.
   */
  unvaluedCount: number;
  /** Cuántos están en negativo (`estaEnNegativo`). */
  negativeCount: number;
}

export interface StockValuation {
  rows: StockLevelRow[];
  summary: StockValuationSummary;
}

/**
 * Computa niveles + valuación de stock. PURA. Ordena por valor de stock descendente (lo que
 * más plata inmoviliza, primero). `costByProduct` mapea productId → costo vigente.
 *
 * Un stock NEGATIVO no se valúa (vale 0, no resta): es un error de carga que hay que recontar,
 * no mercadería. Si restara, un faltante de un corte caro escondería el valor de los demás.
 */
export function computeStockValuation(
  products: readonly StockProductInput[],
  costByProduct: Readonly<Record<string, number | null | undefined>>,
): StockValuation {
  const rows: StockLevelRow[] = products.map((p) => {
    const rawCost = costByProduct[p.id];
    const unitCost = rawCost != null && Number.isFinite(rawCost) && rawCost > 0 ? rawCost : null;
    const stockValue = unitCost != null && p.stock > 0 ? round2(p.stock * unitCost) : 0;
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      lowStockAt: p.lowStockAt,
      trackStock: p.trackStock,
      unitCost,
      stockValue,
      lowStock: esStockBajo(p),
      negative: estaEnNegativo(p),
      valued: unitCost != null,
    };
  });

  rows.sort((a, b) => b.stockValue - a.stockValue);

  const summary: StockValuationSummary = {
    productCount: rows.length,
    totalValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
    lowStockCount: rows.filter((r) => r.lowStock).length,
    unvaluedCount: rows.filter((r) => !r.valued && r.stock > 0).length,
    negativeCount: rows.filter((r) => r.negative).length,
  };
  return { rows, summary };
}

/**
 * La misma valuación SIN COSTOS, para quien no tiene `costs:read` (el encargado): los niveles
 * y los avisos quedan, la plata no viaja ni al navegador. PURA.
 */
export function sinCostos(v: StockValuation): StockValuation {
  return {
    rows: v.rows.map((r) => ({ ...r, unitCost: null, stockValue: 0, valued: false })),
    summary: { ...v.summary, totalValue: 0, unvaluedCount: 0 },
  };
}
