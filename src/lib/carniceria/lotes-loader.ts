// ============================================================================
// LECTURA de Lotes y vencimientos — servidor, sin "use server".
// ============================================================================
//
// Vivía en lotes-actions.ts, que lleva "use server": era un endpoint que devolvía los lotes
// (con su costo) a quien lo llamara. Acá no es un endpoint: lo llama la página después de
// `requireApp("lotes-y-vencimientos")`, con el negocio ya resuelto.
//
// SQL crudo (la tabla es de la migración cárnica y no está en el cliente de Prisma), adentro de
// `tenantTransaction` (con RLS, afuera no vería ninguna fila) y con el `tenantId` escrito a mano
// en cada tabla (rls.ts: las crudas no pasan por el candado de la app). Si la tabla no existe,
// lista vacía (la página ya mostró "En preparación"); cualquier otro error SUBE: antes se
// tragaba y la pantalla decía "todavía no hay lotes" con la base caída.

import { tenantTransaction } from "@/lib/rls";
import type { Batch, BatchStatus } from "./lotes";
import { motivoDelError } from "./errores";

type Fila = {
  id: string;
  code: string;
  productName: string | null;
  productId: string | null;
  supplierName: string | null;
  packedAt: Date | null;
  expiresAt: Date | null;
  netWeightKg: number | null;
  packages: number;
  unitCost: number | null;
  status: string;
};

const ESTADOS: readonly BatchStatus[] = ["AVAILABLE", "DEPLETED", "EXPIRED", "WITHDRAWN"];

/** Los lotes del negocio, el que vence antes primero. `conCostos` false: sin el costo por kilo. */
export async function listarLotes(tenantId: string, conCostos: boolean): Promise<Batch[]> {
  let filas: Fila[];
  try {
    filas = await tenantTransaction(
      (tx) => tx.$queryRaw<Fila[]>`
        SELECT b."id", b."code", b."productId", b."netWeightKg", b."packages",
               b."unitCost", b."status"::text AS "status", b."packedAt", b."expiresAt",
               p."name" AS "productName", s."name" AS "supplierName"
        FROM "ProductBatch" b
        LEFT JOIN "Product" p ON p."id" = b."productId" AND p."tenantId" = ${tenantId}
        LEFT JOIN "Supplier" s ON s."id" = b."supplierId" AND s."tenantId" = ${tenantId}
        WHERE b."tenantId" = ${tenantId}
        ORDER BY b."expiresAt" ASC NULLS LAST, b."createdAt" DESC`,
      { tenantId },
    );
  } catch (err) {
    if (motivoDelError(err) === "sin-migracion") return [];
    throw err;
  }
  return filas.map((r) => ({
    id: r.id,
    code: r.code,
    productName: r.productName ?? "—",
    productId: r.productId,
    supplierName: r.supplierName,
    packedAt: r.packedAt,
    expiresAt: r.expiresAt,
    netWeightKg: r.netWeightKg === null ? null : Number(r.netWeightKg),
    packages: Number(r.packages ?? 1),
    unitCost: conCostos && r.unitCost !== null ? Number(r.unitCost) : null,
    status: (ESTADOS as readonly string[]).includes(r.status) ? (r.status as BatchStatus) : "AVAILABLE",
  }));
}
