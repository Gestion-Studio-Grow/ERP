// ============================================================================
// Loaders de Devoluciones a proveedor (D4) — cableados a datos reales.
// ============================================================================
//
// - Compras elegibles para devolver: se derivan de `StockPurchase` (kind COMPRA) + sus
//   líneas (existente; `purchased` = lo comprado = tope de lo devolvible). El servicio de
//   S1 (`recordSupplierReturn`) valida el stock real al asentar.
// - Historial: `listSupplierReturns` de S1 (movimientos `DEVOLUCION_PROVEEDOR` del ledger).
//
// Guard `catalog:manage` (operación de mercadería, misma cap que Compras).

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { fmtShortDate } from "@/lib/datetime";
import { listSupplierReturns } from "@/lib/stock/supplier-return";
import type { PurchaseOption, ReturnHistoryRow } from "./types";

/** Compras recientes con sus líneas, como opciones a devolver (tope = lo comprado). */
export async function getReturnablePurchases(): Promise<PurchaseOption[]> {
  await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();
  const purchases = await prisma.stockPurchase.findMany({
    where: { tenantId, kind: "COMPRA" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: { orderBy: { name: "asc" } } },
  });

  return purchases
    .map((p) => ({
      id: p.id,
      label: `${p.supplier ?? "Proveedor"} · ${fmtShortDate(p.createdAt)} · #${p.code}`,
      proveedor: p.supplier ?? "Proveedor",
      fecha: p.createdAt,
      // Solo líneas con producto vigente son devolvibles.
      items: p.items
        .filter((it) => it.productId)
        .map((it) => ({
          id: it.id,
          productId: it.productId,
          name: it.name,
          unit: it.unit,
          purchased: it.quantity,
          unitCost: it.unitCost,
        })),
    }))
    .filter((p) => p.items.length > 0);
}

/** Historial de devoluciones (una fila por producto devuelto). */
export async function getReturnsHistory(): Promise<ReturnHistoryRow[]> {
  await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();
  const rows = await listSupplierReturns(tenantId);
  return rows.map((r) => ({
    id: r.id,
    fecha: r.at,
    producto: r.productName,
    cantidad: r.qty,
    motivo: r.reason ?? "—",
    valor: r.value,
  }));
}
