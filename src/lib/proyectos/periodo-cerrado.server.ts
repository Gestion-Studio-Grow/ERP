/**
 * O40 · un solo candado de «período cerrado» para todo lo de Proyectos que asienta en la caja: cobros, cuotas, pagos,
 * anulaciones, pagos de la empresa, pagos de liquidación y rendiciones. Ningún módulo de `src/lib/proyectos/` crea un
 * movimiento de caja por otro camino que `asentarEnCajaTx` (lo vigila la búsqueda en el código de
 * t01-plata-postgres.test.ts, «C-O40 · búsqueda en el código»). Se lee ADENTRO de la transacción que asienta: si el día
 * o el mes se cerraron, la transacción entera se deshace y la acción devuelve el texto del rechazo (`rechazoDePeriodo`).
 *
 * Carrera con el cierre: el candado `cierre-dia:<negocio>` es el MISMO que toman cerrar el día
 * (`cierre-diario-actions.ts`), congelar el mes (`cierre-mes/acciones.ts`) y abrir un turno (`caja-actions.ts`). Con él,
 * un asiento y un cierre van uno detrás del otro: si el cierre lo tomó primero, el asiento espera y, al leer la frontera
 * (Read Committed: cada sentencia ve lo confirmado), ve el día cerrado y se rechaza; si lo tomó el asiento, el cierre
 * espera a que confirme y lo cuenta. Sin él, un cobro que leyó «abierto» podía confirmar después del cierre, en un día
 * que el arqueo ya no lo incluye.
 *
 * Hueco previo, fuera de T01 (no se toca acá): el libro de caja a mano (`libro-caja-actions.ts`, `addLibroEntry` y
 * `deleteLibroEntry`) lee la frontera con `lastClosedDay` ANTES de su transacción y sin este candado, así que la misma
 * carrera sigue abierta para los asientos manuales.
 */
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { ACCION_CONGELAR, consultaUltimoEstadoCierre } from "@/lib/cierre-mes/cierre-mes";
import { dateStrInBusinessTz } from "@/lib/datetime";
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
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${data.tenantId}`}))`;
  await exigirPeriodoAbiertoTx(tx, data.tenantId, que, data.occurredAt instanceof Date ? data.occurredAt : new Date());
  return tx.cashMovement.create({ data, select: { id: true } });
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
