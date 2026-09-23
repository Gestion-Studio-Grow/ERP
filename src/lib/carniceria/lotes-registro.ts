// ============================================================================
// LOTES — la escritura, dentro de la transacción del llamador. Sin "use server".
// ============================================================================
//
// Separada de lotes-actions.ts ("use server") por dos razones: una función que recibe el
// `tenantId` no puede ser un endpoint, y así la escritura REAL se ejecuta contra la base de QA
// (con la migración cárnica aplicada) sin pasar por la sesión. La acción sólo guarda, lee el
// formulario, audita y responde.
//
// SQL crudo (la tabla no está en el cliente de Prisma) con el `tenantId` escrito a mano en cada
// sentencia: rls.ts avisa que las crudas no pasan por el candado de la app.

import type { Prisma } from "@/generated/prisma/client";
import { instanteDelDia, type BatchStatus } from "./lotes";

type Tx = Prisma.TransactionClient;

/** Un error de carga que se le muestra a la persona tal cual. */
export class LoteInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "LoteInvalido";
  }
}

export type LoteNuevo = {
  id: string;
  codigo: string;
  productId: string;
  supplierId: string | null;
  /** Días de calendario ("AAAA-MM-DD"). */
  envasado: string | null;
  vence: string;
  netWeightKg: number | null;
  packages: number;
  unitCost: number | null;
  note: string | null;
  /** "user:<id>" */
  actor: string;
};

/** Alta de un lote. El corte y el proveedor tienen que ser del negocio. */
export async function crearLoteEnTx(tx: Tx, tenantId: string, l: LoteNuevo): Promise<void> {
  const producto = await tx.product.findFirst({ where: { id: l.productId, tenantId, deletedAt: null }, select: { id: true } });
  if (!producto) throw new LoteInvalido("Ese corte ya no existe. Recargá la pantalla y elegilo de nuevo.");
  if (l.supplierId) {
    const prov = await tx.supplier.findFirst({ where: { id: l.supplierId, tenantId }, select: { id: true } });
    if (!prov) throw new LoteInvalido("Ese proveedor ya no existe. Elegí otro o dejalo vacío.");
  }
  await tx.$executeRaw`
    INSERT INTO "ProductBatch"
      ("id","tenantId","productId","supplierId","code","packedAt","expiresAt",
       "netWeightKg","packages","unitCost","status","note","createdBy","updatedAt")
    VALUES
      (${l.id}, ${tenantId}, ${l.productId}, ${l.supplierId}, ${l.codigo}, ${l.envasado ? instanteDelDia(l.envasado) : null},
       ${instanteDelDia(l.vence)}, ${l.netWeightKg && l.netWeightKg > 0 ? l.netWeightKg : null}, ${l.packages},
       ${l.unitCost && l.unitCost > 0 ? l.unitCost : null}, 'AVAILABLE', ${l.note}, ${l.actor}, CURRENT_TIMESTAMP)`;
}

/**
 * Cambia el estado de un lote del negocio. Bloquea la fila, lee de qué estado viene (para la
 * auditoría) y escribe sólo si cambia. `igual`: ya estaba en ese estado (un doble toque).
 */
export async function cambiarEstadoEnTx(
  tx: Tx,
  tenantId: string,
  id: string,
  status: BatchStatus,
): Promise<{ code: string; desde: string; igual: boolean }> {
  const [antes] = await tx.$queryRaw<{ code: string; status: string }[]>`
    SELECT "code", "status"::text AS "status" FROM "ProductBatch"
    WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  if (!antes) throw new LoteInvalido("Ese lote ya no existe. Recargá la pantalla.");
  if (antes.status === status) return { code: antes.code, desde: antes.status, igual: true };
  // Cast explícito: el parámetro llega como texto y la columna es el enum "BatchStatus".
  await tx.$executeRaw`
    UPDATE "ProductBatch" SET "status" = CAST(${status} AS "BatchStatus"), "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "tenantId" = ${tenantId}`;
  return { code: antes.code, desde: antes.status, igual: false };
}
