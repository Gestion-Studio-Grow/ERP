// Loader del POS: stock y control de stock por producto, para que la caja pueda avisar el
// faltante ANTES de mandar la venta y explicar el estado vacío. Gate `orders:read` (el mismo
// de la caja): la recepción vende pero no edita catálogo, así que también devuelve si quien
// mira puede ir a cargar precios (`catalog:manage`) o tiene que pedirlo.
//
// Filtro `tenantId` explícito además de RLS (cinturón y tiradores, igual que getPosData).

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import type { PosStockInfo } from "./pos-stock-rules";

export type PosStockSnapshot = {
  // Productos activos del tenant (con o sin precio): distingue "no hay nada" de "hay
  // productos pero ninguno con precio" en el estado vacío.
  activeProducts: number;
  canManageCatalog: boolean;
  stockById: Record<string, PosStockInfo>;
};

export async function getPosStockSnapshot(): Promise<PosStockSnapshot> {
  const user = await requireCapability("orders:read");
  const tenantId = await getCurrentTenantId();
  const rows = await prisma.product.findMany({
    where: { tenantId, deletedAt: null, active: true },
    select: { id: true, stock: true, trackStock: true },
  });
  const stockById: Record<string, PosStockInfo> = {};
  for (const r of rows) stockById[r.id] = { stock: r.stock, trackStock: r.trackStock };
  return {
    activeProducts: rows.length,
    canManageCatalog: roleHasCapability(user.role, "catalog:manage"),
    stockById,
  };
}
