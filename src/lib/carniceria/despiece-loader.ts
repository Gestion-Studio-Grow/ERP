// ============================================================================
// LECTURA de Despiece — servidor, sin "use server".
// ============================================================================
//
// Vivía en despiece-actions.ts ("use server"): era un endpoint que devolvía los despieces con
// sus costos a quien lo llamara. Acá lo llama la página después de `requireApp("despiece")`,
// con el negocio ya resuelto. SQL crudo adentro de `tenantTransaction` y con el `tenantId`
// escrito a mano en cada tabla (rls.ts). Sin la tabla, lista vacía; cualquier otro error SUBE
// (antes se tragaba y la pantalla decía "todavía no registraste ningún despiece").

import { tenantTransaction } from "@/lib/rls";
import { analyzeDespiece } from "./despiece";
import { motivoDelError } from "./errores";

export interface CorridaLeida {
  id: string;
  code: number;
  inputName: string;
  inputWeightKg: number;
  inputCost: number;
  status: string;
  createdAt: Date;
  outputs: { name: string; weightKg: number; productId: string | null }[];
  totalOutputKg: number;
  mermaKg: number;
  costPerSellableKg: number | null;
}

export async function listarDespieces(tenantId: string): Promise<CorridaLeida[]> {
  try {
    return await tenantTransaction(
      async (tx) => {
        const runs = await tx.$queryRaw<
          { id: string; code: number; inputName: string; inputWeightKg: number; inputCost: number; status: string; createdAt: Date }[]
        >`SELECT "id","code","inputName","inputWeightKg","inputCost","status"::text AS "status","createdAt"
          FROM "ProcessingRun" WHERE "tenantId" = ${tenantId} ORDER BY "code" DESC`;
        const outs = await tx.$queryRaw<{ runId: string; name: string; weightKg: number; productId: string | null }[]>`
          SELECT "runId","name","weightKg","productId" FROM "ProcessingOutput" WHERE "tenantId" = ${tenantId}`;
        const porCorrida = new Map<string, CorridaLeida["outputs"]>();
        for (const o of outs) {
          const lista = porCorrida.get(o.runId) ?? [];
          lista.push({ name: o.name, weightKg: Number(o.weightKg), productId: o.productId });
          porCorrida.set(o.runId, lista);
        }
        return runs.map((r) => {
          const outputs = porCorrida.get(r.id) ?? [];
          const inputWeightKg = Number(r.inputWeightKg);
          const inputCost = Number(r.inputCost);
          const a = analyzeDespiece({ inputWeightKg, inputCost, outputs });
          return {
            id: r.id,
            code: Number(r.code),
            inputName: r.inputName,
            inputWeightKg,
            inputCost,
            status: r.status,
            createdAt: r.createdAt,
            outputs,
            totalOutputKg: a.totalOutputKg,
            mermaKg: a.mermaKg,
            costPerSellableKg: a.costPerSellableKg,
          };
        });
      },
      { tenantId },
    );
  } catch (err) {
    if (motivoDelError(err) === "sin-migracion") return [];
    throw err;
  }
}
