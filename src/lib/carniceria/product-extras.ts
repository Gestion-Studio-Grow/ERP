// ============================================================================
// Extras de Product del rubro cárnico — `category` (góndola explícita) y `cost`
// (costo de referencia por corte). Columnas de la migración Gate 2 (NO en
// schema.prisma) → acceso por SQL crudo con degradación. Si las columnas no
// existen todavía en prod, todo devuelve vacío/no-op y el catálogo sigue con la
// góndola DERIVADA del nombre y el margen sobre el último costo de compra.
//
// RLS: `Product` ya tiene policy; los raw van dentro de `tenantTransaction` (setea el
// GUC) + WHERE tenantId explícito. Con el flag OFF (demo) es una tx común. Una consulta
// cruda FUERA de la transacción corre sin el negocio puesto y, con RLS encendido, no ve
// ninguna fila (rls.ts: las crudas no pasan por la extensión): la lectura de abajo estaba
// así y la pantalla de Stock perdía la góndola explícita sin avisar.

import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";

export interface ProductExtras {
  category: string | null;
  cost: number | null;
}

/**
 * Lee `category`/`cost` de todos los productos del tenant → Map por id, ADENTRO de
 * `tenantTransaction` (con el negocio puesto para RLS). Las columnas se leen con
 * `to_jsonb(p) ->> 'columna'`, que da NULL si todavía no existen (pre-migración) en vez de
 * un error, como `cargarGondolas` y `leerCostosDelCatalogo`. Ante cualquier error de lectura,
 * Map VACÍO (la pantalla sigue con la góndola derivada del nombre).
 */
export async function getProductExtras(): Promise<Map<string, ProductExtras>> {
  try {
    const tenantId = await getCurrentTenantId();
    const rows = await tenantTransaction(
      (tx) => tx.$queryRaw<{ id: string; category: string | null; cost: number | string | null }[]>`
        SELECT p."id", (to_jsonb(p) ->> 'category') AS "category", (to_jsonb(p) ->> 'cost')::float8 AS "cost"
          FROM "Product" p
         WHERE p."tenantId" = ${tenantId}`,
      { tenantId },
    );
    return new Map(
      rows.map((r) => {
        const cost = r.cost == null ? null : Number(r.cost);
        return [r.id, { category: r.category ?? null, cost: cost != null && Number.isFinite(cost) ? cost : null }];
      }),
    );
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
