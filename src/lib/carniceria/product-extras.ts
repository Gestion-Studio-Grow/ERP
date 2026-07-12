// ============================================================================
// Extras de Product del rubro cárnico — `category` (góndola explícita) y `cost`
// (costo de referencia por corte). Columnas de la migración Gate 2 (NO en
// schema.prisma) → acceso por SQL crudo con degradación. Si las columnas no
// existen todavía en prod, todo devuelve vacío/no-op y el catálogo sigue con la
// góndola DERIVADA del nombre y el margen sobre el último costo de compra.
//
// RLS: `Product` ya tiene policy; los raw van dentro de `tenantTransaction` (setea el
// GUC) + WHERE tenantId explícito. Con el flag OFF (demo) es una tx común.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";

export interface ProductExtras {
  category: string | null;
  cost: number | null;
}

/**
 * Lee `category`/`cost` de todos los productos del tenant → Map por id. Degrada a Map
 * VACÍO si las columnas no existen (pre-migración) o ante cualquier error de lectura.
 */
export async function getProductExtras(): Promise<Map<string, ProductExtras>> {
  try {
    const tenantId = await getCurrentTenantId();
    const rows = await prisma.$queryRaw<{ id: string; category: string | null; cost: number | null }[]>`
      SELECT "id", "category", "cost" FROM "Product" WHERE "tenantId" = ${tenantId}`;
    return new Map(rows.map((r) => [r.id, { category: r.category ?? null, cost: r.cost ?? null }]));
  } catch {
    return new Map();
  }
}

/**
 * Escribe `category`/`cost` de un producto (raw UPDATE, scope por tenant). No-op silencioso
 * si las columnas no existen todavía (pre-migración) — así el ABM del catálogo nunca rompe
 * por querer setear un campo que aún no está en la DB. `undefined` = no tocar ese campo.
 */
export async function writeProductExtras(
  productId: string,
  extras: { category?: string | null; cost?: number | null },
): Promise<void> {
  if (extras.category === undefined && extras.cost === undefined) return;
  try {
    const tenantId = await getCurrentTenantId();
    await tenantTransaction(async (tx) => {
      if (extras.category !== undefined) {
        await tx.$executeRaw`UPDATE "Product" SET "category" = ${extras.category} WHERE "id" = ${productId} AND "tenantId" = ${tenantId}`;
      }
      if (extras.cost !== undefined) {
        await tx.$executeRaw`UPDATE "Product" SET "cost" = ${extras.cost} WHERE "id" = ${productId} AND "tenantId" = ${tenantId}`;
      }
    });
  } catch {
    // Columna inexistente (pre-migración) o error de escritura → no-op (fail-safe).
  }
}
