// ============================================================================
// LECTURA de Recibir mercadería (compras) — servidor, sin "use server".
// ============================================================================
//
// Vivía en stock-actions.ts, que lleva "use server": era un endpoint que devolvía productos y
// las últimas compras CON sus costos a quien lo llamara. Acá no es un endpoint; lo llama la
// página después de `requireApp("recibir-mercaderia")`.
//
// Costos: sólo con `costs:read`. El encargado (RECEPTION) recibe mercadería sin ver cuánto
// costó: a su pantalla las compras recientes llegan sin un peso (no se esconden en el
// navegador: no viajan).

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { whereProveedoresActivos } from "@/lib/suppliers/supplier";

export async function getComprasData() {
  const user = await requireCapability("stock:receive");
  const tenantId = await getCurrentTenantId();
  const conCostos = roleHasCapability(user.role, "costs:read");
  const [products, recent, proveedores] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, stock: true, lowStockAt: true, trackStock: true },
    }),
    prisma.stockPurchase.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        code: true,
        kind: true,
        supplier: true,
        notes: true,
        totalCost: true,
        createdAt: true,
        items: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, unit: true, quantity: true, unitCost: true },
        },
      },
    }),
    leerProveedores(tenantId),
  ]);
  return {
    products,
    recent: conCostos
      ? recent
      : recent.map((r) => ({ ...r, totalCost: 0, items: r.items.map((i) => ({ ...i, unitCost: 0 })) })),
    proveedores,
    conCostos,
  };
}

// El maestro de proveedores para elegir. CH (vivo) abre esta pantalla todos los días y la tabla
// `Supplier` no está medida en Neon (lote-deploy.txt sugiere que su migración está aplicada, pero
// no se midió): si no existe, la pantalla sigue como siempre, con el proveedor escrito a mano,
// en vez de caerse. Cualquier otro error sube.
async function leerProveedores(tenantId: string) {
  try {
    return await prisma.supplier.findMany({
      where: whereProveedoresActivos(tenantId),
      orderBy: { name: "asc" },
      select: { id: true, name: true, taxId: true },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return [];
    throw err;
  }
}
