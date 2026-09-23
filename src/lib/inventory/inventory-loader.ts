// ============================================================================
// INVENTARIO LIGHT (D5) — loader SERVER (Prisma → tipos). ADR-060.
// ============================================================================
//
// Gemelo server de `./valuation.ts` (puro). Lee, por negocio: los productos activos con su
// stock actual y su COSTO VIGENTE (src/lib/stock/costo.ts), el mismo número que usan el
// Catálogo (con la misma regla: `costosVigentesDe` + `leerCostosDelCatalogo`, de acá, en
// catalogo/precios-lectura.ts, pausados incluidos) y el Margen (reports/margin-loader.ts).
// Read-only, SIN schema nuevo.
//
// Guard `stock:read`: el encargado (RECEPTION) ve el stock. Los costos, sólo quien tiene
// `costs:read`: sin ella ni se leen, y la valuación sale en cero (`sinCostos`). No es un
// "use server": no es un endpoint, lo llaman páginas del servidor.
//
// Rubro-gated de hecho: un negocio de servicios sin productos con stock devuelve filas vacías.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import {
  computeStockValuation,
  sinCostos,
  whereProductosDeStock,
  type StockValuation,
} from "./valuation";

/**
 * `Product.cost` de todos los productos del negocio: el costo que la dueña cargó a mano en el
 * catálogo (columna de la migración cárnica, que no está en todas las bases).
 *
 * No usa `getProductExtras` (carniceria/product-extras.ts), que corría fuera de una
 * transacción y, con RLS encendido, devolvía vacío sin avisar (la integración de la ola 2 la
 * pasó adentro de una). Acá la consulta va dentro de `tenantTransaction` y lee la columna con
 * `to_jsonb(p) ->> 'cost'`, que da NULL si la columna no existe en vez de un error: sin la
 * migración aplicada el mapa sale vacío y manda el último ingreso con costo.
 */
export async function leerCostosDelCatalogo(tenantId: string): Promise<Map<string, number>> {
  const filas = await tenantTransaction(
    (tx) => tx.$queryRaw<{ id: string; cost: number | string | null }[]>`
      SELECT p."id", (to_jsonb(p) ->> 'cost')::float8 AS "cost"
        FROM "Product" p
       WHERE p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL
         AND (to_jsonb(p) ->> 'cost') IS NOT NULL`,
    { tenantId },
  );
  const out = new Map<string, number>();
  for (const f of filas) {
    const n = Number(f.cost);
    if (Number.isFinite(n) && n > 0) out.set(f.id, n);
  }
  return out;
}

/**
 * El costo vigente de los productos del negocio (todos, o sólo `productIds`). Para las
 * pantallas que necesitan el costo de algunos productos sin la valuación entera (el recuento,
 * la ficha de un proveedor). Mismo cálculo que Stock: `costosVigentesDe`.
 */
export async function leerCostosVigentes(
  tenantId: string,
  productIds?: readonly string[],
): Promise<Record<string, number | null>> {
  const [productos, catalogo] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, ...(productIds ? { id: { in: [...productIds] } } : {}) },
      select: { id: true, ...SELECT_INGRESOS },
    }),
    leerCostosDelCatalogo(tenantId),
  ]);
  return costosVigentesDe(productos, catalogo);
}

/**
 * Niveles de stock + valuación a costo vigente del negocio actual. Sin `costs:read`, los
 * niveles y los avisos (bajo el mínimo, en negativo) sin un solo peso.
 */
export async function getInventoryValuation(): Promise<StockValuation & { conCostos: boolean }> {
  const user = await requireCapability("stock:read");
  const tenantId = await getCurrentTenantId();
  const conCostos = roleHasCapability(user.role, "costs:read");

  const base = { id: true, name: true, unit: true, stock: true, lowStockAt: true, trackStock: true } as const;
  if (!conCostos) {
    const products = await prisma.product.findMany({
      where: whereProductosDeStock(tenantId),
      select: base,
      orderBy: { name: "asc" },
    });
    return { ...sinCostos(computeStockValuation(products, {})), conCostos };
  }

  const [products, catalogo] = await Promise.all([
    prisma.product.findMany({
      where: whereProductosDeStock(tenantId),
      select: { ...base, ...SELECT_INGRESOS },
      orderBy: { name: "asc" },
    }),
    leerCostosDelCatalogo(tenantId),
  ]);
  return { ...computeStockValuation(products, costosVigentesDe(products, catalogo)), conCostos };
}
