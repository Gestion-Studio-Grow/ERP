"use server";

// Capability AJUSTES / MERMAS de stock (F2) — el tercer flujo de inventario junto a
// la venta (order-actions) y la compra/reposición (stock-actions). Mismo patrón:
// guard de capability al tope, getCurrentTenantId (fail-closed ADR-015) en cada
// write, audit + revalidatePath al terminar. La aritmética de signo vive pura y
// unit-testeada en src/lib/stock/adjustment-core.ts; acá sólo están el guard, el
// adaptador FormData → AdjustmentInput y el loader de pantalla.
//
// Reusa `catalog:manage` (igual que compras): ajustar/dar de baja stock es gestión
// de catálogo del mismo tenor que cargar productos y reponer. No se agrega una
// capability nueva para no inflar el RBAC (gobierno calidad-vs-costo).

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { insertStockAdjustment } from "@/lib/stock/adjustment-insert";
import {
  ADJUSTMENT_MOTIVOS,
  filtroDeAjustables,
  leerLineasDeAjuste,
  motivoMode,
  type AdjustmentMotivo,
} from "@/lib/stock/adjustment-core";

const ADJ_PATH = "/admin/ajustes";

function parseMotivo(raw: FormDataEntryValue | null): AdjustmentMotivo {
  const v = String(raw ?? "").trim().toUpperCase();
  return (ADJUSTMENT_MOTIVOS as readonly string[]).includes(v)
    ? (v as AdjustmentMotivo)
    : "RECUENTO";
}

// --- Loader de la pantalla de ajustes ---
//
// Productos ajustables (activos, no borrados) con su stock actual para el recuento,
// y los últimos movimientos de AJUSTE para el histórico. Guard de lectura por
// `catalog:read`.
//
// `productoPreelegido` (el `?producto=` del "Recontar" del catálogo) entra a la lista AUNQUE
// esté inactivo (`filtroDeAjustables`, en el núcleo puro). Nunca sale del tenant: el `where`
// lleva `tenantId`.
export async function getAdjustmentData(productoPreelegido?: string) {
  await requireCapability("catalog:read");
  const tenantId = await getCurrentTenantId();
  const [products, recent] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, ...filtroDeAjustables(productoPreelegido) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, stock: true, active: true },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId, type: "AJUSTE" },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        qty: true,
        balanceAfter: true,
        reason: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
  ]);
  return { products, recent };
}

// Líneas: arrays paralelos productId[]/value[] (patrón getAll del Core). Se leen con la
// MISMA regla que la pantalla (`leerLineasDeAjuste`, coma decimal, signo sólo en OTRO) y lo
// ilegible lanza con mensaje. Antes era `Number(x.replace(",", "."))`: un valor que no era
// número llegaba NaN y la línea se descartaba sin avisar.
function parseLines(formData: FormData, motivo: AdjustmentMotivo): { productId: string; value: number }[] {
  return leerLineasDeAjuste(
    motivoMode(motivo),
    formData.getAll("productId").map(String),
    formData.getAll("value").map(String),
  );
}

// --- Registrar un ajuste / merma ---
//
// Asienta un StockMovement tipo AJUSTE por línea con delta ≠ 0 y aplica el delta
// firmado (el core lo hace atómico en una transacción). Requiere gestión de catálogo.
export async function createStockAdjustment(formData: FormData) {
  const user = await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();

  const motivo = parseMotivo(formData.get("motivo"));
  const note = String(formData.get("note") || "").trim() || null;

  const result = await insertStockAdjustment(tenantId, {
    motivo,
    note,
    createdBy: `user:${user.id}`,
    items: parseLines(formData, motivo),
  });

  await auditAdmin({
    action: "adjust",
    entity: "StockMovement",
    entityId: `ajuste:${motivo}`,
    changes: { motivo, note, lines: result.applied },
  });
  revalidatePath(ADJ_PATH);
  // El stock ajustado también cambia lo que muestran catálogo, compras y POS.
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/compras");
  revalidatePath("/admin/pedidos");
}
