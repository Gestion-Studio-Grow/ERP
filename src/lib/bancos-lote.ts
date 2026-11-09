/**
 * CANDADO DEL LOTE de conciliación bancaria / Mercado Pago (tanda plata, punto 3).
 *
 * Dos procesos no pueden tomar el mismo lote (ImportacionBancaria) a la vez:
 *
 *  - El RE-PROCESO (confirmar el mapeo) borra los movimientos del lote y los recrea. Toma la fila
 *    del lote `FOR UPDATE`, vuelve a contar lo emitido ADENTRO de la transacción y, si hay algo
 *    emitido o atado a una factura, no toca nada. El borrado, además, sólo alcanza lo provisional.
 *  - La EMISIÓN reclama cada movimiento (auto → emitida) con la fila del lote `FOR SHARE`: espera
 *    a que termine un re-proceso en curso (y entonces el movimiento ya no existe: no reclama), o
 *    el re-proceso espera al reclamo y lo ve emitido (y se niega).
 *
 * Antes el control de «nada emitido» corría FUERA de la transacción del borrado: un reclamo que
 * entraba en el medio quedaba con su factura emitida y el movimiento borrado y recreado como
 * «auto», listo para facturarse dos veces.
 */
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const LOTE_YA_FACTURADO =
  "Esta importación ya tiene facturas emitidas: no se puede reprocesar con otro mapeo.";

/** Fila del lote tomada para escribir. `false` si el lote no es de este negocio o no existe. */
export async function tomarLoteParaReprocesarEnTx(tx: Tx, tenantId: string, importacionId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "ImportacionBancaria" WHERE id = ${importacionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  return filas.length > 0;
}

/** Fila del lote compartida: varias emisiones a la vez sí, junto a un re-proceso no. */
export async function compartirLoteParaEmitirEnTx(tx: Tx, tenantId: string, importacionId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "ImportacionBancaria" WHERE id = ${importacionId} AND "tenantId" = ${tenantId} FOR SHARE`;
}

/**
 * Con el lote ya tomado: borra lo provisional para recrearlo. Si algo del lote está emitido o
 * atado a una factura, no borra nada y devuelve el motivo.
 */
export async function vaciarLoteProvisionalEnTx(
  tx: Tx,
  tenantId: string,
  importacionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await tomarLoteParaReprocesarEnTx(tx, tenantId, importacionId))) {
    return { ok: false, error: "No se encontró la importación." };
  }
  const facturados = await tx.movimientoImportado.count({
    where: { tenantId, importacionId, OR: [{ estadoPropuesta: "emitida" }, { invoiceId: { not: null } }] },
  });
  if (facturados > 0) return { ok: false, error: LOTE_YA_FACTURADO };
  await tx.movimientoImportado.deleteMany({
    where: { tenantId, importacionId, estadoPropuesta: { not: "emitida" }, invoiceId: null },
  });
  return { ok: true };
}
