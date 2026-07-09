// ============================================================================
// Loader de Inventario (niveles + valuación) — ⚠️ STUB (dependencia S1).
// ============================================================================
//
// El READ MODEL de inventario (niveles de stock actuales + último costo por producto) lo
// publica S1. Hoy devuelve vacío: la pantalla se recorre (detrás de flags, perfil Empresa)
// mostrando su estructura + estado "en preparación", SIN dead-end. Punto de cableado
// `TODO(S1)`: cuando su read model esté en el árbol, se mapea a `InventoryInput[]` y
// `buildInventory` calcula la valuación (el contrato de vista ya está fijo).
//
// Guard `catalog:read` (vista de solo lectura del stock, mismo cap que `getStockData`).

import { requireCapability } from "@/lib/authz";
import { buildInventory, type InventoryRow, type InventorySummary } from "./valuation";

export interface InventoryReport {
  rows: InventoryRow[];
  summary: InventorySummary;
}

export async function getInventory(): Promise<InventoryReport> {
  await requireCapability("catalog:read");
  // TODO(S1): mapear el read model de inventario a InventoryInput[] y llamar a buildInventory.
  return buildInventory([]);
}
