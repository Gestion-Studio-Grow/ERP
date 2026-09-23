// ============================================================================
// ADENTRO DE LA TRANSACCIÓN — leer el catálogo y aplicar un aumento con la tx del llamador.
// ============================================================================
//
// Separado de la acción (precios-actions.ts, "use server") y de las lecturas de las páginas
// (precios-lectura.ts) para poder EJECUTARLO en un test con una transacción falsa: qué pasa si
// la huella no coincide, si falta la confirmación extra, o si el conteo de registros no cierra.
// La acción sólo le agrega la guardia, la transacción Serializable con reintento y los mensajes.
//
// No es "use server" (no es un endpoint) y no importa ningún valor de Prisma: recibe la tx.
//
// `category` (la góndola) no está en el cliente de Prisma: es de la migración cárnica, que
// todavía no está en todas las bases. Se lee con `to_jsonb(p) ->> 'category'`, que da NULL si
// la columna no existe en vez de un error, con el `"tenantId"` escrito a mano (una consulta
// cruda no pasa por el candado de la app, rls.ts) y adentro de la tx del llamador, que ya tiene
// el negocio puesto para RLS.

import type { LedgerTx } from "@/lib/stock/ledger";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { escribirPlan } from "./planilla-core";
import { aumentoAplicable, planificarAumento, type PedidoAumento, type PlanAumento, type ProductoParaPrecios } from "./aumento-core";
import { registrarCambiosDePrecio } from "./precios-auditoria";

/**
 * ¿La transacción abortó porque otra, al mismo tiempo, tocó las mismas filas (Postgres 40001,
 * Serializable)? Prisma lo informa de dos formas: P2034 cuando salta en una operación de
 * modelo, y P2010 con "40001" cuando salta en una consulta cruda, como el UPDATE de
 * `escribirPlan`. Es la MISMA regla con la que `tenantTransaction` reintenta
 * (conflicto-de-escritura.ts): una sola definición.
 */
export const esConflictoDeSerializacion: (e: unknown) => boolean = esConflictoDeEscritura;

/** Las columnas de `Product` que leen Actualizar precios y Etiquetas. */
export const SELECT_PRECIOS = {
  id: true,
  name: true,
  unit: true,
  active: true,
  saleUnit: true,
  price: true,
  pricePerKg: true,
} as const;

export type ProductoConUnidad = ProductoParaPrecios & { unit: string };

/**
 * Los productos del negocio (no borrados), con su góndola, leídos adentro de la tx del
 * llamador. La acción que aplica un aumento lo llama DENTRO de la transacción que escribe:
 * el plan se arma contra lo que la base tiene en ese momento.
 */
export async function leerProductosParaPrecios(tx: LedgerTx, tenantId: string): Promise<ProductoConUnidad[]> {
  const filas = await tx.product.findMany({
    where: { tenantId, deletedAt: null },
    select: SELECT_PRECIOS,
    orderBy: { name: "asc" },
  });
  const categorias = await tx.$queryRaw<{ id: string; category: string | null }[]>`
    SELECT p."id", (to_jsonb(p) ->> 'category') AS "category"
      FROM "Product" p
     WHERE p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL
       AND (to_jsonb(p) ->> 'category') IS NOT NULL`;
  const porId = new Map(categorias.map((c) => [c.id, c.category]));
  return filas.map((f) => ({
    ...f,
    saleUnit: f.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
    category: porId.get(f.id) ?? null,
  }));
}

export type ResultadoAumento =
  | { ok: true; cambiados: number; registros: number }
  | {
      ok: false;
      mensaje: string;
      /** El plan que armó el servidor, cuando llegó a armarlo. */
      plan?: PlanAumento;
      /** Falta la confirmación extra de un cambio de más del 30 %. */
      pideConfirmacion?: true;
      /** Los precios cambiaron desde que se abrió la pantalla: hay que mirar la vista previa nueva. */
      catalogoCambio?: true;
    };

/**
 * Relee el catálogo, rearma el plan y, si es EL MISMO que vio la persona (misma huella) y tiene
 * la confirmación que corresponde, escribe los precios y una fila de auditoría por producto.
 * Si el conteo de filas escritas y registradas no cierra, lanza: la tx del llamador se deshace.
 */
export async function aplicarAumentoEnTx(
  tx: LedgerTx,
  args: { tenantId: string; actor: string; lote: string; pedido: PedidoAumento; huella: string; confirmado: boolean },
): Promise<ResultadoAumento> {
  const { tenantId, pedido } = args;
  const plan = planificarAumento(await leerProductosParaPrecios(tx, tenantId), pedido);
  if (!aumentoAplicable(plan)) return { ok: false, mensaje: plan.error ?? "No hay precios para cambiar.", plan };
  if (plan.plan.huella !== args.huella) {
    return {
      ok: false,
      mensaje: "Los precios cambiaron desde que abriste la pantalla. Revisá la vista previa, que ya está actualizada, y aplicá de nuevo.",
      plan,
      catalogoCambio: true,
    };
  }
  if (plan.pideConfirmacion && !args.confirmado) {
    return { ok: false, mensaje: "Un cambio de más del 30 % se confirma dos veces.", plan, pideConfirmacion: true };
  }
  const escrito = await escribirPlan(tx, tenantId, plan.plan);
  const registros = await registrarCambiosDePrecio(tx, {
    tenantId,
    actor: args.actor,
    origen: "actualizar-precios",
    cambios: plan.filas.map((f) => ({ productId: f.productId, nombre: f.nombre, saleUnit: f.saleUnit, antes: f.antes, despues: f.despues })),
    lote: { id: args.lote, sentido: plan.sentido, porcentaje: plan.porcentaje ?? undefined, redondeo: plan.redondeo },
  });
  // Un precio cambiado sin su registro no se deja pasar: se deshace todo.
  if (registros !== escrito.cambios) {
    throw new Error(`Se cambiaron ${escrito.cambios} precios y se registraron ${registros}: no se guardó nada.`);
  }
  return { ok: true, cambiados: escrito.cambios, registros };
}
