"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { recordSupplierReturn } from "@/lib/stock/supplier-return";
import { validateReturnLine } from "@/lib/devoluciones/return-validation";

// Registrar una DEVOLUCIÓN a proveedor (D4). Cada línea (producto + cantidad) se asienta con
// el servicio ATÓMICO de S1 (`recordSupplierReturn`): saca del stock (DEVOLUCION_PROVEEDOR) y
// acredita la deuda del proveedor (Collection PAYABLE) si la compra tiene una cuenta a pagar
// abierta. AUTORIDAD SERVER: `unitCost` y el tope comprado se leen de la compra, no del
// cliente; la validación (no devolver más de lo comprado) es la misma regla PURA del form.
export async function registerReturn(formData: FormData): Promise<void> {
  const user = await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();

  const purchaseId = String(formData.get("purchaseId") || "").trim();
  const motivo = String(formData.get("motivo") || "").trim() || null;
  if (!purchaseId) return;

  // Compra origen (autoridad de unitCost + cantidad comprada por línea).
  const purchase = await prisma.stockPurchase.findFirst({
    where: { id: purchaseId, tenantId },
    include: { items: true },
  });
  if (!purchase) return;
  const itemByProduct = new Map(
    purchase.items.filter((i) => i.productId).map((i) => [i.productId as string, i]),
  );

  // Cuenta a pagar abierta de esta compra, para acreditarle la devolución (pata financiera D4).
  const ap = await prisma.accountPayable.findFirst({
    where: { tenantId, purchaseId, status: "OPEN" },
    select: { id: true },
  });

  const productIds = formData.getAll("productId").map(String);
  const qtys = formData.getAll("qty").map((v) => Number(String(v).replace(",", ".")));

  for (let i = 0; i < productIds.length; i++) {
    const item = itemByProduct.get(productIds[i]);
    if (!item) continue;
    const v = validateReturnLine(qtys[i], item.quantity);
    if (!v.ok) continue;
    await recordSupplierReturn(tenantId, {
      productId: productIds[i],
      qty: v.qty,
      unitCost: item.unitCost,
      purchaseId,
      reason: motivo,
      label: item.name,
      payableId: ap?.id ?? null,
      by: `user:${user.id}`,
    });
  }

  revalidatePath("/admin/devoluciones-proveedor");
}
