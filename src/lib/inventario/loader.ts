// ============================================================================
// Loader de Stock (niveles + valuación) — cableado al read model de inventario.
// ============================================================================
//
// Mapea `getInventoryValuation` (inventory/inventory-loader.ts: productos + costo vigente) al
// CONTRATO DE VISTA (`./valuation`). El guard (`stock:read`) y la regla de costos (`costs:read`)
// los aplica el read model; acá sólo se re-nombra. Read-only.

import { getInventoryValuation } from "@/lib/inventory/inventory-loader";
import { aFilaDeInventario, aResumenDeInventario, type InventoryRow, type InventorySummary } from "./valuation";

export interface InventoryReport {
  rows: InventoryRow[];
  summary: InventorySummary;
  /** ¿Quien mira puede ver costos? Si no, filas y resumen vienen sin un peso. */
  conCostos: boolean;
}

export async function getInventory(): Promise<InventoryReport> {
  const val = await getInventoryValuation();
  return {
    rows: val.rows.map(aFilaDeInventario),
    summary: aResumenDeInventario(val.summary),
    conCostos: val.conCostos,
  };
}
