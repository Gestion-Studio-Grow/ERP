"use server";

// ============================================================================
// DESPIECE — server actions (SQL crudo para ProcessingRun/Output + ledger de stock).
// Tablas de la migración Gate 2. Registrar un despiece: guarda la corrida y sus
// cortes y SUMA el stock de cada corte (ledger REPOSICION) con su COSTO real (costo/kg
// vendible) en el movimiento. NO escribe `Product.cost`: ver `createRun`.
// Degrada a no-op / [] sin schema aplicado (hasCarniceriaSchema gatea la pantalla).
// ============================================================================

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { recordMovement } from "@/lib/stock/ledger";
import { analyzeDespiece, type DespieceOutput } from "./despiece";

const DESPIECE_PATH = "/admin/despiece";

export interface RunRow {
  id: string;
  code: number;
  inputName: string;
  inputWeightKg: number;
  inputCost: number;
  status: string;
  createdAt: Date;
  outputs: { name: string; weightKg: number }[];
  totalOutputKg: number;
  mermaKg: number;
  costPerSellableKg: number | null;
}

/** Historial de despieces del tenant, con su merma y costo/kg. Degrada a [] sin schema. */
export async function listRuns(): Promise<RunRow[]> {
  try {
    await requireCapability("catalog:read");
    const tenantId = await getCurrentTenantId();
    return await tenantTransaction(async (tx) => {
      const runs = await tx.$queryRaw<
        { id: string; code: number; inputName: string; inputWeightKg: number; inputCost: number; status: string; createdAt: Date }[]
      >`SELECT "id","code","inputName","inputWeightKg","inputCost","status","createdAt"
        FROM "ProcessingRun" WHERE "tenantId" = ${tenantId} ORDER BY "code" DESC`;
      const outs = await tx.$queryRaw<{ runId: string; name: string; weightKg: number }[]>`
        SELECT "runId","name","weightKg" FROM "ProcessingOutput" WHERE "tenantId" = ${tenantId}`;
      const byRun = new Map<string, { name: string; weightKg: number }[]>();
      for (const o of outs) {
        const list = byRun.get(o.runId) ?? [];
        list.push({ name: o.name, weightKg: o.weightKg });
        byRun.set(o.runId, list);
      }
      return runs.map((r) => {
        const outputs = byRun.get(r.id) ?? [];
        const a = analyzeDespiece({ inputWeightKg: r.inputWeightKg, inputCost: r.inputCost, outputs });
        return {
          id: r.id,
          code: Number(r.code),
          inputName: r.inputName,
          inputWeightKg: r.inputWeightKg,
          inputCost: r.inputCost,
          status: r.status,
          createdAt: r.createdAt,
          outputs,
          totalOutputKg: a.totalOutputKg,
          mermaKg: a.mermaKg,
          costPerSellableKg: a.costPerSellableKg,
        };
      });
    }, { tenantId });
  } catch {
    return [];
  }
}

/**
 * Registra un despiece: media res (peso + costo) → cortes (peso c/u). Guarda la corrida
 * y sus outputs y SUMA el stock de cada corte con productId (ledger REPOSICION) con el
 * costo por kilo vendible (prorrateo real) como `unitCost` del movimiento. Todo en UNA
 * transacción. No-op sin schema.
 *
 * NO pisa `Product.cost`. Antes lo escribía en cada corrida, y como el costo vigente
 * (stock/costo.ts) le da prioridad a `Product.cost` sobre el último ingreso, el costo de un
 * despiece viejo le ganaba para siempre a las compras posteriores del mismo corte.
 * `Product.cost` es el que fija la dueña a mano; el del despiece viaja en su REPOSICION, que
 * es un ingreso con costo y el costo vigente ya lo lee (regla 2).
 */
export async function createRun(formData: FormData): Promise<void> {
  await requireCapability("catalog:manage");
  const inputName = String(formData.get("inputName") || "").trim();
  const inputWeightKg = Number(formData.get("inputWeightKg"));
  const inputCost = Number(formData.get("inputCost")) || 0;
  const supplierId = String(formData.get("supplierId") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  if (!inputName || !Number.isFinite(inputWeightKg) || inputWeightKg <= 0) return;

  const names = formData.getAll("outputName").map((v) => String(v).trim());
  const weights = formData.getAll("outputWeight").map((v) => Number(v));
  const productIds = formData.getAll("outputProductId").map((v) => String(v).trim());
  const outputs: (DespieceOutput & { productId: string | null })[] = [];
  for (let i = 0; i < names.length; i++) {
    const w = weights[i];
    if (!names[i] || !Number.isFinite(w) || w <= 0) continue;
    outputs.push({ name: names[i], weightKg: w, productId: productIds[i] || null });
  }
  if (outputs.length === 0) return;

  const analysis = analyzeDespiece({ inputWeightKg, inputCost, outputs });

  try {
    const tenantId = await getCurrentTenantId();
    await tenantTransaction(async (tx) => {
      const next = await tx.$queryRaw<{ code: number }[]>`
        SELECT COALESCE(MAX("code"), 0) + 1 AS code FROM "ProcessingRun" WHERE "tenantId" = ${tenantId}`;
      const code = Number(next?.[0]?.code ?? 1);
      const runId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "ProcessingRun"
          ("id","tenantId","code","supplierId","inputName","inputWeightKg","inputCost","status","note","createdBy","updatedAt")
        VALUES
          (${runId}, ${tenantId}, ${code}, ${supplierId}, ${inputName}, ${inputWeightKg}, ${inputCost}, 'DONE', ${note}, 'user', CURRENT_TIMESTAMP)`;

      for (let i = 0; i < outputs.length; i++) {
        const o = outputs[i];
        const outId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO "ProcessingOutput" ("id","tenantId","runId","productId","name","weightKg")
          VALUES (${outId}, ${tenantId}, ${runId}, ${o.productId}, ${o.name}, ${o.weightKg})`;

        // Corte mapeado a un producto → suma su stock (kg) con su costo real por kilo en el
        // movimiento. `Product.cost` no se toca (ver el comentario de la función).
        if (o.productId) {
          await recordMovement(tx, {
            tenantId,
            productId: o.productId,
            type: "REPOSICION",
            qty: o.weightKg,
            unitCost: analysis.costPerSellableKg,
            reason: `Despiece #${code} — ${inputName}`,
            createdBy: "user",
          });
        }
      }
    }, { tenantId });
    revalidatePath(DESPIECE_PATH);
    revalidatePath("/admin/catalogo");
    revalidatePath("/admin/inventario");
  } catch {
    // Tabla inexistente (pre-migración) o error → no-op (fail-safe).
  }
}
