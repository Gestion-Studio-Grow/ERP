"use server";

// Capability COMPRAS / REPOSICIÓN de stock del POS — la contracara de la venta.
// Server Actions scoped por tenant, mismo patrón que order-actions.ts: guard de
// capability al tope, getCurrentTenantId (fail-closed ADR-015) en cada write,
// audit + revalidatePath al terminar.
//
// La aritmética (armar líneas, snapshot de costo, total) y el incremento de stock
// viven puros/aislados en src/lib/stock/purchase-core.ts (unit-testeados). Acá solo
// están el guard, el adaptador FormData → PurchaseInput y el loader de pantalla.
//
// Reusa `catalog:manage`: reponer stock y registrar compras es gestión de catálogo
// del mismo tenor que cargar productos y precios. No se agrega una capability nueva
// para no inflar el RBAC (gobierno calidad-vs-costo); si más adelante hace falta
// separar "comprar" de "editar catálogo", se agrega un renglón en capabilities.ts.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { insertStockPurchase, type StockPurchaseKind } from "@/lib/stock/purchase-core";

const STOCK_PATH = "/admin/compras";

// Acepta coma o punto decimal (entrada AR). Devuelve NaN si no es numérico.
function parseNum(raw: FormDataEntryValue | null): number {
  return Number(String(raw ?? "").trim().replace(",", "."));
}

// --- Loader de la pantalla de compras/reposición ---
//
// Devuelve los productos reponibles (activos, no borrados) para el selector y las
// últimas entradas registradas para el histórico. Guard de lectura por
// `catalog:read`. Se traen los productos con su stock/unidad actuales para que el
// operador vea cuánto hay antes de reponer.
export async function getStockData() {
  await requireCapability("catalog:read");
  const tenantId = await getCurrentTenantId();
  const [products, recent] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, stock: true, lowStockAt: true },
    }),
    prisma.stockPurchase.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: { orderBy: { name: "asc" } } },
    }),
  ]);
  return { products, recent };
}

// Parsea las líneas (arrays paralelos productId[]/quantity[]/unitCost[], patrón
// getAll del Core, igual que order-actions.parseItems) a la forma del core.
function parseLines(formData: FormData): { productId: string; qty: number; unitCost: number }[] {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(parseNum);
  const unitCosts = formData.getAll("unitCost").map(parseNum);
  return productIds.map((id, i) => ({
    productId: id,
    qty: quantities[i],
    // El costo es opcional (reposición sin costo): un input vacío llega como NaN y
    // el core lo normaliza a 0.
    unitCost: Number.isFinite(unitCosts[i]) ? unitCosts[i] : 0,
  }));
}

// --- Registrar una compra / reposición ---
//
// Crea el documento + líneas e INCREMENTA el stock de cada producto (el core lo hace
// atómico en una transacción). Requiere capability de gestión de catálogo.
export async function createStockPurchase(formData: FormData) {
  const user = await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();

  const kindRaw = String(formData.get("kind") || "COMPRA").trim();
  const kind: StockPurchaseKind = kindRaw === "REPOSICION" ? "REPOSICION" : "COMPRA";

  const result = await insertStockPurchase(tenantId, {
    kind,
    supplier: String(formData.get("supplier") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    createdBy: `user:${user.id}`,
    items: parseLines(formData),
  });

  await auditAdmin({
    action: "create",
    entity: "StockPurchase",
    entityId: result.id,
    changes: { code: result.code, kind, totalCost: result.totalCost, lines: result.lines },
  });
  revalidatePath(STOCK_PATH);
  // El stock repuesto también cambia lo que muestra el catálogo y el POS.
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/pedidos");
}
