// Persistencia de los ajustes de stock (F2). Orquesta, dentro de una transacción
// tenant-aware, el asiento del StockMovement tipo AJUSTE por cada línea con delta ≠ 0,
// apoyándose en `recordMovement` (único mutador de `Product.stock`) y en la aritmética
// pura de `adjustment-core.ts`. Vive separado del núcleo puro para no arrastrar Prisma
// al bundle del cliente (el formulario reusa los helpers puros para el preview).

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { recordMovement, round3 } from "@/lib/stock/ledger";
import {
  adjustmentDelta,
  buildReason,
  motivoMode,
  requiresNote,
  type AdjustmentMotivo,
} from "@/lib/stock/adjustment-core";

export type AdjustmentInput = {
  motivo: AdjustmentMotivo;
  note: string | null;
  createdBy: string; // actor "user:<id>", lo resuelve la Server Action
  // `value` se interpreta según el motivo (contado / perdido / delta firmado).
  items: { productId: string; value: number }[];
};

export type InsertedAdjustment = {
  motivo: AdjustmentMotivo;
  applied: number; // líneas que efectivamente movieron stock (delta ≠ 0)
};

// Registra un ajuste de stock: por cada línea con delta ≠ 0 asienta un StockMovement
// tipo AJUSTE y aplica el delta, todo en UNA transacción tenant-aware (o entran todos
// o ninguno). El stock actual para el recuento se lee DENTRO de la transacción, no se
// confía en lo que vio la pantalla (que pudo quedar viejo). Sin `allowNegative`: la
// guarda del ledger mantiene stock ≥ 0 — el recuento nunca la choca (deja `contado`,
// que es ≥ 0) y una merma mayor al stock lanza (corregí con un recuento, no dejando
// stock negativo).
export async function insertStockAdjustment(
  tenantId: string,
  input: AdjustmentInput,
): Promise<InsertedAdjustment> {
  const mode = motivoMode(input.motivo);
  if (requiresNote(input.motivo) && !input.note?.trim()) {
    throw new Error("El ajuste 'Otro' necesita una nota que explique el motivo.");
  }

  // Líneas utilizables: producto elegido y valor numérico. El delta real se resuelve
  // dentro de la transacción (el recuento depende del stock vigente).
  const wanted = input.items.filter((l) => l.productId && Number.isFinite(l.value));
  if (wanted.length === 0) {
    throw new Error("Elegí al menos un producto y cargá su valor para registrar el ajuste.");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: wanted.map((l) => l.productId) }, tenantId, deletedAt: null },
    select: { id: true, name: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const reason = buildReason(input.motivo, input.note);

  const applied = await tenantTransaction(
    async (tx) => {
      let count = 0;
      for (const l of wanted) {
        const p = byId.get(l.productId);
        if (!p) continue; // producto ajeno al tenant / inexistente: se ignora.

        // Stock vigente dentro de la tx (autoritativo para el recuento).
        const row = await tx.product.findUnique({
          where: { id: l.productId },
          select: { stock: true },
        });
        if (!row) continue;

        const delta = adjustmentDelta(mode, l.value, round3(row.stock));
        if (delta === 0) continue; // no-op (p. ej. recuento que coincide con el sistema).

        await recordMovement(tx, {
          tenantId,
          productId: l.productId,
          type: "AJUSTE",
          qty: delta, // AJUSTE: qty ES el delta firmado (ver signedDelta en ledger.ts).
          reason,
          createdBy: input.createdBy,
          label: p.name,
        });
        count++;
      }
      return count;
    },
    { tenantId },
  );

  return { motivo: input.motivo, applied };
}
