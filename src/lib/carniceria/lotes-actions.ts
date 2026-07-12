"use server";

// ============================================================================
// LOTES / envasado al vacío — server actions (SQL crudo, tolerante a schema).
// Tabla `ProductBatch` de la migración Gate 2 (prisma/pending-gate2). Si no está
// aplicada, las lecturas degradan a [] y las escrituras son no-op → la pantalla
// muestra "En preparación" (hasCarniceriaSchema) y nada rompe en prod.
// ============================================================================

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import type { Batch, BatchStatus } from "./lotes";

const LOTES_PATH = "/admin/lotes";

type Row = {
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

/** Lista los lotes del tenant (con nombre de corte y proveedor). Degrada a [] sin schema. */
export async function listBatches(): Promise<Batch[]> {
  try {
    await requireCapability("catalog:read");
    const tenantId = await getCurrentTenantId();
    const rows = await tenantTransaction(
      (tx) => tx.$queryRaw<Row[]>`
        SELECT b."id", b."code", b."productId", b."netWeightKg", b."packages",
               b."unitCost", b."status", b."packedAt", b."expiresAt",
               p."name" AS "productName", s."name" AS "supplierName"
        FROM "ProductBatch" b
        LEFT JOIN "Product" p ON p."id" = b."productId"
        LEFT JOIN "Supplier" s ON s."id" = b."supplierId"
        WHERE b."tenantId" = ${tenantId}
        ORDER BY b."expiresAt" ASC NULLS LAST, b."createdAt" DESC`,
      { tenantId },
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      productName: r.productName ?? "—",
      productId: r.productId,
      supplierName: r.supplierName,
      packedAt: r.packedAt,
      expiresAt: r.expiresAt,
      netWeightKg: r.netWeightKg,
      packages: Number(r.packages ?? 1),
      unitCost: r.unitCost,
      status: (r.status as BatchStatus) ?? "AVAILABLE",
    }));
  } catch {
    return [];
  }
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Alta de un lote de envasado al vacío. No-op silencioso si la tabla no existe aún. */
export async function createBatch(formData: FormData): Promise<void> {
  await requireCapability("catalog:manage");
  const productId = String(formData.get("productId") || "").trim() || null;
  const code = String(formData.get("code") || "").trim();
  const supplierId = String(formData.get("supplierId") || "").trim() || null;
  const packedAt = parseDate(formData.get("packedAt"));
  const expiresAt = parseDate(formData.get("expiresAt"));
  const netWeightKg = parseNum(formData.get("netWeightKg"));
  const packagesRaw = Number(formData.get("packages"));
  const packages = Number.isFinite(packagesRaw) && packagesRaw > 0 ? Math.floor(packagesRaw) : 1;
  const unitCost = parseNum(formData.get("unitCost"));
  const note = String(formData.get("note") || "").trim() || null;
  if (!code) return;

  try {
    const tenantId = await getCurrentTenantId();
    const id = randomUUID();
    await tenantTransaction(
      (tx) => tx.$executeRaw`
        INSERT INTO "ProductBatch"
          ("id","tenantId","productId","supplierId","code","packedAt","expiresAt",
           "netWeightKg","packages","unitCost","status","note","createdBy","updatedAt")
        VALUES
          (${id}, ${tenantId}, ${productId}, ${supplierId}, ${code}, ${packedAt}, ${expiresAt},
           ${netWeightKg}, ${packages}, ${unitCost}, 'AVAILABLE', ${note}, 'user', CURRENT_TIMESTAMP)`,
      { tenantId },
    );
    revalidatePath(LOTES_PATH);
  } catch {
    // Tabla inexistente (pre-migración) o violación de unicidad de code → no-op.
  }
}

/** Cambia el estado de un lote (retirar / marcar agotado / re-disponibilizar). */
export async function setBatchStatus(formData: FormData): Promise<void> {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const valid: BatchStatus[] = ["AVAILABLE", "DEPLETED", "EXPIRED", "WITHDRAWN"];
  if (!id || !valid.includes(status as BatchStatus)) return;
  try {
    const tenantId = await getCurrentTenantId();
    await tenantTransaction(
      (tx) => tx.$executeRaw`
        UPDATE "ProductBatch" SET "status" = ${status}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "tenantId" = ${tenantId}`,
      { tenantId },
    );
    revalidatePath(LOTES_PATH);
  } catch {
    // no-op
  }
}
