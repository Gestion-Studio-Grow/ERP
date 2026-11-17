/**
 * T01b (MIA-075) · el ÚNICO lugar del código que escribe en `CashMovement`. Lo vigila `candado-asiento.test.ts`: busca
 * en todo `src/` cada escritura al libro (método de Prisma, escritura anidada o SQL a mano) y exige que esté en este
 * archivo, y sigue hacia arriba cada llamada a estas funciones hasta la transacción que la abre: tiene que ser
 * `transaccionQueAsienta`.
 *
 * La carrera que cierra (cert. MIA-064, fila 1 y corrección 4): el candado `cierre-dia:<negocio>` es el MISMO que toman
 * cerrar el día (`cierre-diario-actions.ts`), reabrirlo y congelar el mes (`cierre-mes/acciones.ts`) y abrir un turno
 * (`caja-actions.ts`), y pone a un asiento y a un cierre uno detrás del otro. El candado solo no alcanza: el cierre del
 * día y congelar el mes corren en Serializable, y Postgres saca la foto de esa transacción en su primera sentencia, ANTES
 * de esperar el candado. Un asiento que confirmaba mientras el cierre esperaba no entraba en su foto: el cierre cerraba
 * sin contarlo y asentaba un sobrante, y el libro quedaba con una fila en un día cerrado.
 * Por eso el asiento también corre en Serializable (`transaccionQueAsienta`; cada función de acá lo exige) y lee la
 * frontera ADENTRO, después del candado. El asiento lee la frontera, que el cierre escribe, y escribe en el libro, que el
 * cierre lee. Con las dos en Serializable, Postgres aborta a la segunda por ese ciclo, y el reintento de
 * `tenantTransaction` la corre con una foto nueva:
 *   · si llegó primero el cierre, el asiento ve el día cerrado (o el mes congelado) y se rechaza;
 *   · si llegó primero el asiento, el cierre del día lo cuenta y congelar el mes lo ve y no congela.
 * Nada de Read Committed en el cierre: rompe el ciclo con abrir un turno (`caja-actions.ts`, M1-C5) y con reabrir.
 * Los dos órdenes, con el cierre real, los prueban t01-plata-postgres.test.ts (Proyectos) y
 * t01b-candado-caja-postgres.test.ts (el resto de los caminos).
 */
import { Prisma } from "@/generated/prisma/client";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { ACCION_CONGELAR, consultaUltimoEstadoCierre } from "@/lib/cierre-mes/cierre-mes";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { tenantTransaction } from "@/lib/rls";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { motivoPeriodoCerrado, type QueSeAsienta } from "@/lib/proyectos/periodo-cerrado-core";

export type { QueSeAsienta };

/**
 * El rechazo viaja como excepción para deshacer todo lo que la transacción ya escribió. Es un rechazo de dominio: la
 * transacción se deshizo entera, así que «no se grabó» es cierto, y las acciones muestran su texto tal cual
 * (`rechazoDeDominio`, `motivoDelRechazoDelAlta`) en vez del aviso genérico o de «no pudimos confirmar».
 */
export class PeriodoCerradoError extends RechazoDeDominio {
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
export async function exigirPeriodoAbiertoTx(tx: Prisma.TransactionClient, tenantId: string, que: QueSeAsienta = "movimiento", cuando: Date = new Date(), verbo?: "registró" | "borró"): Promise<void> {
  const dia = dateStrInBusinessTz(cuando);
  const [frontera, ultimo] = await Promise.all([lastClosedDayTx(tx, tenantId), tx.auditLog.findFirst(consultaUltimoEstadoCierre(tenantId, dia.slice(0, 7)))]);
  const motivo = motivoPeriodoCerrado({ dia, frontera, mesCongelado: ultimo?.action === ACCION_CONGELAR, que, verbo });
  if (motivo) throw new PeriodoCerradoError(motivo);
}

/** Serializable y el candado del negocio, o no se escribe: sin las dos cosas la carrera con el cierre sigue abierta. */
async function entrarAlCandadoTx(tx: Prisma.TransactionClient, tenantId: string, quien: string): Promise<void> {
  const [{ nivel }] = await tx.$queryRaw<{ nivel: string }[]>`SELECT current_setting('transaction_isolation') AS nivel`;
  if (nivel !== "serializable") throw new Error(`${quien}: la transacción corre en «${nivel}» y tiene que ser Serializable (transaccionQueAsienta).`);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${tenantId}`}))`;
}

const SOLO_ID = { id: true } as const;

/**
 * El único camino para crear un movimiento de caja: candado, día abierto (el de `occurredAt`, hoy si no viene) y recién
 * ahí el asiento. Devuelve lo que pide `select` (el id, si no se pide nada).
 */
export async function asentarEnCajaTx<S extends Prisma.CashMovementSelect = typeof SOLO_ID>(
  tx: Prisma.TransactionClient,
  que: QueSeAsienta,
  data: Prisma.CashMovementUncheckedCreateInput,
  select?: S,
): Promise<Prisma.CashMovementGetPayload<{ select: S }>> {
  await entrarAlCandadoTx(tx, data.tenantId, "asentarEnCajaTx");
  await exigirPeriodoAbiertoTx(tx, data.tenantId, que, data.occurredAt instanceof Date ? data.occurredAt : data.occurredAt ? new Date(data.occurredAt) : new Date());
  return tx.cashMovement.create({ data, select: (select ?? SOLO_ID) as S }) as Promise<Prisma.CashMovementGetPayload<{ select: S }>>;
}

/** Borrar un asiento a mano (el libro): con el candado y sólo si su día sigue abierto. */
export async function borrarDeCajaTx(tx: Prisma.TransactionClient, tenantId: string, mov: { id: string; occurredAt: Date }, que: QueSeAsienta = "movimiento"): Promise<void> {
  await entrarAlCandadoTx(tx, tenantId, "borrarDeCajaTx");
  await exigirPeriodoAbiertoTx(tx, tenantId, que, mov.occurredAt, "borró");
  await tx.cashMovement.delete({ where: { id: mov.id } });
}

/**
 * Los ajustes que asienta el propio cierre del día (sobrante o faltante del día que se cierra) y que quita reabrirlo.
 * Sin control de período: son el cierre mismo. Con Serializable y el candado, como todo lo demás.
 */
export async function asentarAjustesDelCierreTx(tx: Prisma.TransactionClient, tenantId: string, data: Prisma.CashMovementCreateManyInput[]): Promise<number> {
  await entrarAlCandadoTx(tx, tenantId, "asentarAjustesDelCierreTx");
  return (await tx.cashMovement.createMany({ data })).count;
}

/** Quitar del libro filas que no son un asiento del día: los ajustes de un cierre que se reabre y el reseteo previo a salir en vivo. */
export async function quitarDelLibroTx(tx: Prisma.TransactionClient, tenantId: string, ids: string[]): Promise<number> {
  await entrarAlCandadoTx(tx, tenantId, "quitarDelLibroTx");
  return (await tx.cashMovement.deleteMany({ where: { tenantId, id: { in: ids } } })).count;
}

/**
 * La transacción de toda acción que asienta en la caja: Serializable, como el cierre del día y congelar el mes (ver
 * arriba). Un conflicto con otra transacción aborta y `tenantTransaction` la reintenta entera, con una foto nueva; por
 * eso lo que va adentro no tiene efectos fuera de la base.
 */
export function transaccionQueAsienta<T>(
  fn: Parameters<typeof tenantTransaction<T>>[0],
  opts?: Omit<NonNullable<Parameters<typeof tenantTransaction<T>>[1]>, "isolationLevel">,
): Promise<T> {
  return tenantTransaction(fn, { ...opts, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
