/**
 * O40 · un solo candado de «período cerrado» para todo lo de Proyectos que asienta en la caja: cobros, cuotas, pagos,
 * anulaciones, pagos de la empresa, pagos de liquidación y rendiciones. Ningún módulo de `src/lib/proyectos/` crea un
 * movimiento de caja por otro camino que `asentarEnCajaTx` (lo vigila la búsqueda en el código de
 * t01-plata-postgres.test.ts, «C-O40 · búsqueda en el código»). Se lee ADENTRO de la transacción que asienta: si el día
 * o el mes se cerraron, la transacción entera se deshace y la acción devuelve el texto del rechazo (`rechazoDePeriodo`).
 *
 * Carrera con el cierre: el candado `cierre-dia:<negocio>` es el MISMO que toman cerrar el día
 * (`cierre-diario-actions.ts`), congelar el mes (`cierre-mes/acciones.ts`) y abrir un turno (`caja-actions.ts`), y pone
 * a un asiento y a un cierre uno detrás del otro. El candado solo no alcanza: el cierre del día y congelar el mes corren
 * en Serializable, y Postgres saca la foto de esa transacción en su primera sentencia, ANTES de esperar el candado. El
 * cierre que llegaba segundo no veía el asiento que había confirmado mientras esperaba: cerraba sin contarlo y asentaba
 * un sobrante (cert. MIA-064, fila 1), y congelar el mes cerraba el día como «sin movimientos».
 * Por eso el asiento también corre en Serializable (`transaccionQueAsienta`; `asentarEnCajaTx` lo exige). El asiento lee
 * la frontera, que el cierre escribe, y escribe en el libro, que el cierre lee. Con las dos en Serializable, Postgres
 * aborta a la segunda por ese ciclo, y el reintento de `tenantTransaction` la corre con una foto nueva:
 *   · si llegó primero el cierre, el asiento ve el día cerrado (o el mes congelado) y se rechaza;
 *   · si llegó primero el asiento, el cierre del día lo cuenta y congelar el mes lo ve y no congela.
 * Los dos órdenes, con el cierre real, los prueban los tests «C-O40 · carrera» de t01-plata-postgres.test.ts.
 *
 * Hueco previo, fuera de T01 (no se toca acá): el libro de caja a mano (`libro-caja-actions.ts`, `addLibroEntry` y
 * `deleteLibroEntry`) lee la frontera con `lastClosedDay` ANTES de su transacción y sin este candado, así que la misma
 * carrera sigue abierta para los asientos manuales.
 */
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { ACCION_CONGELAR, consultaUltimoEstadoCierre } from "@/lib/cierre-mes/cierre-mes";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { tenantTransaction } from "@/lib/rls";
import { motivoPeriodoCerrado, type QueSeAsienta } from "./periodo-cerrado-core";

/** El rechazo viaja como excepción para deshacer todo lo que la transacción ya escribió. */
export class PeriodoCerradoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodoCerradoError";
  }
}

/** El texto del rechazo si `err` es el del candado; `null` si es otro error (que sigue subiendo). */
export function rechazoDePeriodo(err: unknown): string | null {
  return err instanceof PeriodoCerradoError ? err.message : null;
}

/** Lanza `PeriodoCerradoError` si el día de caja de `cuando` (hoy, por defecto) está cerrado o su mes congelado. */
export async function exigirPeriodoAbiertoTx(tx: Prisma.TransactionClient, tenantId: string, que: QueSeAsienta = "movimiento", cuando: Date = new Date()): Promise<void> {
  const dia = dateStrInBusinessTz(cuando);
  const [frontera, ultimo] = await Promise.all([lastClosedDayTx(tx, tenantId), tx.auditLog.findFirst(consultaUltimoEstadoCierre(tenantId, dia.slice(0, 7)))]);
  const motivo = motivoPeriodoCerrado({ dia, frontera, mesCongelado: ultimo?.action === ACCION_CONGELAR, que });
  if (motivo) throw new PeriodoCerradoError(motivo);
}

/** El único camino de Proyectos para crear un movimiento de caja: primero el candado, después el asiento. */
export async function asentarEnCajaTx(tx: Prisma.TransactionClient, que: QueSeAsienta, data: Prisma.CashMovementUncheckedCreateInput) {
  // Sin Serializable, el candado no cierra la carrera con el cierre (ver arriba): se corta acá, no se asienta.
  const [{ nivel }] = await tx.$queryRaw<{ nivel: string }[]>`SELECT current_setting('transaction_isolation') AS nivel`;
  if (nivel !== "serializable") throw new Error(`asentarEnCajaTx: la transacción corre en «${nivel}» y tiene que ser Serializable (transaccionQueAsienta).`);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${data.tenantId}`}))`;
  await exigirPeriodoAbiertoTx(tx, data.tenantId, que, data.occurredAt instanceof Date ? data.occurredAt : new Date());
  return tx.cashMovement.create({ data, select: { id: true } });
}

/**
 * La transacción de toda acción de Proyectos que asienta en la caja: Serializable, como el cierre del día y congelar el
 * mes (ver arriba). Un conflicto con otra transacción aborta y `tenantTransaction` la reintenta entera, con una foto
 * nueva; por eso lo que va adentro no tiene efectos fuera de la base.
 */
export function transaccionQueAsienta<T>(fn: Parameters<typeof tenantTransaction<T>>[0]): Promise<T> {
  return tenantTransaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Corre la transacción y devuelve el rechazo del candado como valor (para `if (r instanceof PeriodoCerradoError)`). */
export async function oPeriodoCerrado<T>(hacer: () => Promise<T>): Promise<T | PeriodoCerradoError> {
  try {
    return await hacer();
  } catch (err) {
    if (err instanceof PeriodoCerradoError) return err;
    throw err;
  }
}
