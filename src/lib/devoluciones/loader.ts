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
import { listSupplierReturns, alreadyReturnedByProduct } from "@/lib/stock/supplier-return";
import { remainingReturnable } from "@/lib/devoluciones/return-validation";
import type { PurchaseOption, ReturnHistoryRow } from "./types";

/** Compras recientes con sus líneas, como opciones a devolver (tope = comprado − ya_devuelto). */
export async function getReturnablePurchases(): Promise<PurchaseOption[]> {
  await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();
  const purchases = await prisma.stockPurchase.findMany({
    where: { tenantId, kind: "COMPRA" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: { orderBy: { name: "asc" } } },
  });

  // A-4: el tope de cada línea es lo comprado MENOS lo ya devuelto de esa compra+producto.
  // Sin descontar las devoluciones previas, de una compra de 10 kg se podía devolver 8 + 8.
  // Se leen las devoluciones ya asentadas por compra (una consulta agrupada por compra).
  const returnedByPurchase = new Map<string, Map<string, number>>(
    await Promise.all(
      purchases.map(async (p) => {
        const productIds = p.items.map((it) => it.productId).filter((id): id is string => !!id);
        return [p.id, await alreadyReturnedByProduct(tenantId, p.id, productIds)] as const;
      }),
    ),
  );

  return purchases
    .map((p) => {
      const returned = returnedByPurchase.get(p.id) ?? new Map<string, number>();
      return {
        id: p.id,
        label: `${p.supplier ?? "Proveedor"} · ${fmtShortDate(p.createdAt)} · #${p.code}`,
        proveedor: p.supplier ?? "Proveedor",
        fecha: p.createdAt,
        // Solo líneas con producto vigente Y con saldo devolvible (> 0) siguen siendo opciones.
        items: p.items
          .filter((it) => it.productId)
          .map((it) => ({
            id: it.id,
            productId: it.productId,
            name: it.name,
            unit: it.unit,
            purchased: remainingReturnable(it.quantity, returned.get(it.productId as string) ?? 0),
            unitCost: it.unitCost,
          }))
          .filter((it) => it.purchased > 0),
      };
    })
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
