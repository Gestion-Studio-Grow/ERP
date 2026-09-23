// FRONTERA DE CONGELAMIENTO del libro de caja: hasta qué día está cerrado el tenant.
//
// Vive aparte (y no en una server action) porque la leen dos módulos: el libro
// (`libro-caja-actions.ts`, para rechazar altas y bajas en días cerrados) y el cierre
// diario (`cierre-diario-actions.ts`, para saber desde dónde arranca el período).
//
// DE DÓNDE SALE EL DÍA CERRADO. Dos fuentes, y se toma la MAYOR:
//
//   1. El CORTE INICIAL — el día en que el negocio dejó la planilla. Lo escribe
//      `scripts/corte-inicial.ts` como marca `corte-inicial:<día>` en `createdBy` de
//      sus movimientos de ajuste.
//   2. El CIERRE DIARIO — cada día que la persona cierra desde `/admin/caja/cierre`.
//      Se registra como fila de `AuditLog` (`entity: "CierreDiario"`, `entityId: <día>`).
//
// POR QUÉ EL CIERRE VA EN AuditLog Y NO EN UNA MARCA DE MOVIMIENTO. Porque un cierre
// que CUADRA no produce ningún movimiento —no hay diferencia que asentar— y sin
// embargo tiene que congelar el día igual: si no, se podría agregar una fila a un día
// ya contado y los números cerrados dejarían de coincidir con el libro. La marca en
// `createdBy` sólo existe cuando hay ajuste; la fila de auditoría existe siempre.
//
// ⚠️ Por eso `purgeAuditLogs` NO borra estas filas (ver audit-retention.ts): son estado
// de negocio, no rastro. Es la única excepción de la política de retención.
//
// Esto es deliberadamente el sustituto del modelo `CashDayClose` del diseño
// (docs/producto/diseno-cierre-diario-caja.md §5), que exigiría una migración más
// sobre las tres que ya esperan autorización del dueño. Los seis números por medio que
// ese modelo congelaría son DERIVABLES de lo que sí queda escrito: el esperado sale del
// ledger (inmutable por debajo del día cerrado), la diferencia es el ajuste, y lo
// declarado es la suma de los dos. Cuando el modelo aterrice, este archivo es el único
// que cambia.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { compareDayKeys, isDayKey, type DayKey } from "@/lib/caja/cierre-diario";
import { todayInBusinessTz } from "@/lib/datetime";
import { CORTE_INICIAL_ACTOR_PREFIX } from "@/lib/caja/corte-inicial";

/** Entidad y acción con las que el cierre diario queda escrito en `AuditLog`. */
export const CIERRE_DIARIO_ENTITY = "CierreDiario";
export const CIERRE_DIARIO_ACTION = "caja.cierre-diario";

/**
 * Último día CERRADO del tenant, o `null` si nunca se cerró nada.
 *
 * Sin cierre no hay congelamiento: `isFrozenDay(x, null)` es siempre false, así que un
 * tenant que todavía no cortó opera exactamente como antes.
 */
export async function lastClosedDay(tenantId: string): Promise<DayKey | null> {
  const [corte, cierre] = await Promise.all([
    prisma.cashMovement.findFirst(consultaCorte(tenantId)),
    prisma.auditLog.findFirst(consultaCierre(tenantId)),
  ]);
  return fronteraDesde(corte, cierre, todayInBusinessTz());
}

/**
 * La MISMA frontera, leída con la transacción que se le pasa en vez del prisma ambiental.
 *
 * Existe para quien lee la caja de OTRO tenant dentro de `tenantTransaction` (la cartera
 * del contador). `lastClosedDay` usa el prisma ambiental, que resuelve el GUC de RLS por el
 * contexto del que llama: desde la action del estudio es el GUC del ESTUDIO, y adentro de
 * una `tenantTransaction` la rama `insideTx` de rls.ts corre la consulta con su propio
 * `query`, no con el `tx`. Leído del código, no medido contra una base: en los dos casos
 * RLS no le mostraría las filas del cliente y la respuesta sería `null` sin error — "nunca
 * cerró", que es mentira. Con el `tx` del cliente las dos consultas corren con su GUC.
 * Mismas consultas y misma regla que `lastClosedDay`: salen de un solo lugar.
 */
export async function lastClosedDayTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<DayKey | null> {
  const [corte, cierre] = await Promise.all([
    tx.cashMovement.findFirst(consultaCorte(tenantId)),
    tx.auditLog.findFirst(consultaCierre(tenantId)),
  ]);
  return fronteraDesde(corte, cierre, todayInBusinessTz());
}

/** El último ajuste del corte inicial: su marca trae el día cortado. */
function consultaCorte(tenantId: string) {
  return {
    where: { tenantId, createdBy: { startsWith: CORTE_INICIAL_ACTOR_PREFIX } },
    orderBy: { occurredAt: "desc" },
    select: { createdBy: true },
  } as const;
}

/**
 * El último cierre diario registrado.
 *
 * `action` además de `entity`, y el día no puede ser futuro: dos guardas de cordura
 * sobre la fila que decide hasta cuándo está CONGELADO el libro de un tenant.
 *
 * Esta consulta es la que más daño puede hacer de todo el módulo: un `entityId` de
 * "9999-12-31" deja el libro sin poder cargar ni borrar nada, sin pantalla que lo
 * revierta y exento de la purga. Filtrar por `action` descarta cualquier fila que no
 * haya nacido del cierre, y el tope de hoy descarta un día imposible venga de donde
 * venga — de una action publicada sin guarda (ya pasó, ver `audit-core.ts`), de un
 * import, o de alguien tipeando SQL. No reemplaza a la guarda de escritura: la respalda.
 */
function consultaCierre(tenantId: string) {
  return {
    where: { tenantId, entity: CIERRE_DIARIO_ENTITY, action: CIERRE_DIARIO_ACTION },
    orderBy: { entityId: "desc" }, // los DayKey ISO ordenan lexicográficamente
    select: { entityId: true },
  } as const;
}

/** Corte y cierre leídos → el día cerrado. El cierre futuro no cuenta (ver `consultaCierre`). */
function fronteraDesde(
  corte: { createdBy: string } | null,
  cierre: { entityId: string | null } | null,
  hoy: DayKey,
): DayKey | null {
  const delCorte = corte?.createdBy.slice(CORTE_INICIAL_ACTOR_PREFIX.length) ?? null;
  const delCierre = cierre?.entityId ?? null;
  const cierreSano = delCierre && compareDayKeys(delCierre, hoy) <= 0 ? delCierre : null;
  return maxDay(delCorte, cierreSano);
}

/** El mayor de dos días, ignorando lo que no sea un DayKey válido. */
export function maxDay(a: string | null, b: string | null): DayKey | null {
  const va = isDayKey(a) ? a : null;
  const vb = isDayKey(b) ? b : null;
  if (va && vb) return compareDayKeys(va, vb) >= 0 ? va : vb;
  return va ?? vb;
}
