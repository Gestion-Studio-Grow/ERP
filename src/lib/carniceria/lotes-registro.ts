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

import { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { instanteDelDia, motivoDeVentaVencida, type BatchStatus } from "./lotes";

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

/**
 * El rechazo de la guarda: el motivo para el mostrador (con el código del lote y qué hacer) y,
 * aparte, el texto para el CLIENTE (`paraElCliente`: la tienda, la API externa), sin lotes ni
 * tareas internas. Es un `RechazoDeDominio`: los caminos del backoffice lo muestran tal cual.
 */
export class LoteVencidoRechazado extends RechazoDeDominio {
  readonly producto: string;
  readonly paraElCliente: string;
  constructor(motivo: string, producto: string) {
    super(motivo);
    this.name = "LoteVencidoRechazado";
    this.producto = producto;
    this.paraElCliente = `"${producto.slice(0, 60)}" no está disponible en este momento. Sacalo del pedido y volvé a enviarlo; si lo necesitás, escribinos y te ofrecemos otro corte.`;
  }
}

/**
 * GUARDA DE LA VENTA (T3): frena la venta de un corte cuyos lotes DISPONIBLES están todos
 * vencidos (regla y porqué en `motivoDeVentaVencida`, lotes.ts). Corre ADENTRO de la
 * transacción del alta, antes de grabar nada: si rechaza, no hay venta, ni stock, ni caja.
 *
 * Sólo la llama el alta cuando el negocio tiene Lotes listos (`lotesListosParaVender`,
 * schema-probe.ts: rubro de perecederos Y migración aplicada), en los cinco caminos que venden. Sin la tabla, la consulta abortaría la transacción entera
 * (Postgres no sigue después de un error): por eso NO se llama "a ver si existe". `hoy` es el día
 * del negocio. El `tenantId` va escrito a mano (rls.ts: las crudas no pasan por el candado).
 *
 * `FOR SHARE` (T3b): mientras la venta no termina, nadie cambia el estado de esos lotes (retirar
 * el único vigente a mitad de la venta). Es compartido, no `FOR UPDATE`: dos ventas del mismo
 * corte no se esperan (con UPDATE se serializarían y, con los cortes en distinto orden, podrían
 * trabarse entre sí). Sin riesgo de abrazo con la baja de stock: el único que escribe un lote
 * existente es `cambiarEstadoEnTx`, que bloquea esa fila sola y no toca Product; el alta de un lote
 * inserta una fila nueva (no la ve el SELECT). La guarda corre antes de tocar Product.
 */
export async function controlarLotesVencidosEnTx(
  tx: Tx,
  tenantId: string,
  lineas: readonly { productId: string; name: string }[],
  hoy: string,
): Promise<void> {
  const ids = [...new Set(lineas.map((l) => l.productId).filter(Boolean))];
  if (ids.length === 0) return;
  const filas = await tx.$queryRaw<{ productId: string; code: string; expiresAt: Date | null }[]>`
    SELECT "productId", "code", "expiresAt" FROM "ProductBatch"
    WHERE "tenantId" = ${tenantId} AND "status" = 'AVAILABLE' AND "productId" IN (${Prisma.join(ids)})
    FOR SHARE`;
  if (filas.length === 0) return;
  const porCorte = new Map<string, { code: string; expiresAt: Date | null; status: BatchStatus }[]>();
  for (const f of filas) {
    const lista = porCorte.get(f.productId) ?? [];
    lista.push({ code: f.code, expiresAt: f.expiresAt, status: "AVAILABLE" });
    porCorte.set(f.productId, lista);
  }
  for (const l of lineas) {
    const motivo = motivoDeVentaVencida(l.name, porCorte.get(l.productId) ?? [], hoy);
    if (motivo) throw new LoteVencidoRechazado(motivo, l.name);
  }
}
