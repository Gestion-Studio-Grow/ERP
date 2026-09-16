// LIQUIDAR UNA COMISIÓN: cuánto es, y qué plata sale de la caja cuando se paga.
// PURO — sin Prisma, sin tenant, sin reloj. La persistencia vive en `commission-actions.ts`.
//
// POR QUÉ EXISTE ESTE ARCHIVO. Dos defectos distintos, el mismo dinero:
//
//   1. LA PLATA NO SE MOVÍA. `settleCommissions` creaba el `CommissionPayout`, estampaba
//      los turnos y no escribía UN SOLO peso en el libro de caja. La dueña le entregaba
//      $80.000 en mano a la profesional y el sistema seguía esperando ese efectivo en el
//      cajón: al cerrar el día, `cerrarDia` encontraba un FALTANTE por el monto entero y
//      lo asentaba como "Diferencia de caja" — una fila que el libro declara IMBORRABLE
//      (`deleteLibroEntry`). O sea: la comisión pagada quedaba registrada para siempre
//      como un descuadre sin explicación, y el libro y el historial de liquidaciones no
//      se cruzaban por ningún campo. Es el mismo defecto que ya se arregló dos veces en
//      este repo —el `closingDiff` varado del arqueo de turno y la compra a proveedor sin
//      egreso—: el sistema SABE que salió plata y no la asienta.
//
//   2. LA ARITMÉTICA NO TENÍA GUARDA. El monto se calculaba con `(payment.amount * pct) / 100`
//      escrito A MANO en DOS lugares que tienen que dar lo mismo (el listado de pendientes
//      que ve la dueña y la liquidación que se persiste), ninguno de los dos pasaba por
//      `round2` —la regla ÚNICA del camino de dinero (ver `round.ts`)— y `resolvePct` no
//      estaba exportada, así que no había forma de testearla. `CommissionPayout.amount` es
//      `Float`: el comprobante congelado se quedaba con el float crudo acumulado
//      (1851.8505 en vez de 1851.85). Un override por servicio mal resuelto o una
//      divergencia entre las dos copias significa pagarle de más o de menos a una persona,
//      con un comprobante que dice otra cosa.
//
// LA BASE DE CÁLCULO YA ESTÁ DECIDIDA y no se discute acá: la comisión se devenga sobre lo
// efectivamente COBRADO, no sobre el precio de lista. Por eso `sePuedeLiquidar`
// (`comision-liquidable.ts`) exige el turno saldado antes de dejar liquidarlo, y por eso la
// `base` que entra acá es `payment.amount` (lo que entró) y nunca `service.price`.

import { round2 } from "@/lib/round";
import type { CashMethod } from "@/lib/caja/cash-register";
import type { DayKey } from "@/lib/caja/cierre-diario";

// ── 1. Cuánto ───────────────────────────────────────────────────────────────

/**
 * El % que le corresponde a un turno: si hay override por (profesional, servicio) manda
 * ese; si no, el % general del profesional.
 *
 * OJO con el `??`: un override de **0 gana** sobre el % general. Es a propósito — cargar
 * 0% para un servicio es cómo se declara "este servicio no paga comisión", y un `||`
 * haría que ese 0 cayera al general y se pagara comisión donde el dueño dijo que no.
 */
export function resolvePct(
  pctGeneral: number,
  overrideByService: ReadonlyMap<string, number>,
  serviceId: string,
): number {
  return overrideByService.get(serviceId) ?? pctGeneral;
}

/**
 * Comisión de UN turno, redondeada a pesos.
 *
 * `base` es lo cobrado. Redondear por turno (y no sólo al final) es la regla elegida: el
 * monto de un turno es plata que se puede llegar a mostrar o discutir línea por línea, y
 * una comisión de "1851.8505" no existe. El total vuelve a pasar por `round2` en
 * `calcularLiquidacion` para que la suma de floats no arrastre su propio ruido.
 */
export function montoComision(base: number, pct: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(pct)) return 0;
  if (pct <= 0 || base <= 0) return 0;
  return round2((base * pct) / 100);
}

export type TurnoParaComision = {
  id: string;
  serviceId: string;
  /** Lo efectivamente COBRADO del turno (`payment.amount`), nunca el precio de lista. */
  base: number;
  startsAt: Date;
};

export type LiquidacionCalculada = {
  /** Turnos que entran en la liquidación (los de pct <= 0 quedan afuera). */
  ids: string[];
  /** Comisión total, redondeada. Es lo que se congela en el `CommissionPayout`. */
  amount: number;
  /** Base sobre la que se calculó, para el "sobre $X" de la pantalla. */
  ingresos: number;
  appointmentCount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
};

/**
 * La liquidación de UN profesional a partir de sus turnos liquidables.
 *
 * Es la ÚNICA fórmula del sistema: la usan el listado de pendientes y la liquidación que
 * se persiste. Antes eran dos copias a mano y el propio código advertía que si divergían
 * "la pantalla mostraría un total y la liquidación escribiría otro".
 *
 * Un turno con pct <= 0 no forma parte de la liquidación: no suma monto, ni base, ni
 * cuenta, ni corre el período. No se le paga comisión, así que tampoco se lo estampa con
 * el payout — si mañana le configuran un %, ese turno todavía está disponible.
 */
export function calcularLiquidacion(
  turnos: readonly TurnoParaComision[],
  pctGeneral: number,
  overrideByService: ReadonlyMap<string, number>,
): LiquidacionCalculada {
  const ids: string[] = [];
  let amount = 0;
  let ingresos = 0;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;

  for (const t of turnos) {
    const pct = resolvePct(pctGeneral, overrideByService, t.serviceId);
    if (pct <= 0) continue;
    amount += montoComision(t.base, pct);
    ingresos += t.base;
    ids.push(t.id);
    if (!periodStart || t.startsAt < periodStart) periodStart = t.startsAt;
    if (!periodEnd || t.startsAt > periodEnd) periodEnd = t.startsAt;
  }

  return {
    ids,
    amount: round2(amount),
    ingresos: round2(ingresos),
    appointmentCount: ids.length,
    periodStart,
    periodEnd,
  };
}

// ── 2. La marca del asiento ─────────────────────────────────────────────────
//
// `CashMovement` NO tiene columna `payoutId` (tiene `orderId`, `paymentId` y
// `collectionId`), y agregar una es una migración más sobre las cinco que ya esperan
// autorización del dueño. Así que el rastro liquidación → asiento va donde ya van las
// otras marcas del libro que no tienen columna propia: en `createdBy`, igual que
// `corte-inicial:<día>`, `cierre-diario:<día>`, `arqueo-turno:<sessionId>` y
// `compra:<purchaseId>`.
//
// Sirve para dos cosas: atar la fila del libro al comprobante que la originó, e impedir
// que se borre desde el libro (dirección única — la liquidación escribe en el libro, el
// libro no toca liquidaciones; ver `deleteLibroEntry`).

export const COMISION_ACTOR_PREFIX = "comision:";

export function comisionMarker(payoutId: string): string {
  return `${COMISION_ACTOR_PREFIX}${payoutId}`;
}

/** ¿Esta fila del libro la escribió una liquidación de comisión? Para no dejar borrarla. */
export function esEgresoDeComision(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(COMISION_ACTOR_PREFIX);
}

// ── 3. Qué sale de la caja ──────────────────────────────────────────────────

// ⚠️ DEFAULT PROVISIONAL, A CONFIRMAR CON EL FORMULARIO.
//
// El formulario de /admin/reportes tiene UN campo (una nota libre) y no pregunta por qué
// medio se le pagó a la profesional. Mientras eso no cambie hay que elegir, y las dos
// opciones son malas de distinta manera: no asentar nada deja el defecto vivo tal cual;
// asumir un medio puede marcar faltante en una columna y sobrante en otra. Se asume
// EFECTIVO —es el caso real: la dueña le paga en mano— pero NO en silencio: el detalle de
// la fila dice "medio no informado (asumido efectivo)" para que se vea y se pueda corregir
// con un movimiento en contra. Se borra el día que el formulario capture el medio.
const MEDIO_ASUMIDO: CashMethod = "EFECTIVO";

// El nombre entra recortado: el detalle se lee en una tabla angosta y en el teléfono, y un
// nombre largo empuja fuera de pantalla el período y la aclaración del medio asumido.
const NOMBRE_MAX = 40;

/** "2026-09-01" → "01/09". El año no entra: el período casi siempre cae dentro del mes. */
function diaCorto(d: DayKey): string {
  const [, mes, dia] = d.split("-");
  return mes && dia ? `${dia}/${mes}` : d;
}

export type EgresoDeComision = {
  type: "EGRESO";
  method: CashMethod;
  amount: number; // siempre > 0; el signo lo aplica el libro según `type`
  reason: string;
  createdBy: string; // marca `comision:<payoutId>`
  dia: DayKey; // fecha CONTABLE del asiento
  medioAsumido: boolean;
  diferidoPorCierre: boolean;
};

/**
 * El EGRESO del libro que corresponde a una liquidación ya calculada.
 *
 * `null` sólo si no hay monto: un payout de $0 no mueve plata y no merece una fila (el
 * llamador ya aborta antes, pero acá no se inventa un egreso de cero en ningún caso).
 *
 * `dia` lo decide el llamador con `diaContableDelEgreso` (mismo criterio que la compra a
 * proveedor): si hoy ya está congelado por un cierre, el asiento se imputa al primer día
 * abierto y el detalle aclara la fecha real del pago, para que la plata no se pierda y el
 * día cerrado no se toque.
 */
export function egresoDeLiquidacion(input: {
  payoutId: string;
  profesional: string;
  amount: number;
  method: CashMethod | null;
  periodStart: DayKey;
  periodEnd: DayKey;
  dia: DayKey;
  hoy: DayKey;
}): EgresoDeComision | null {
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const nombre = input.profesional.trim() || "profesional";
  const corto = nombre.length > NOMBRE_MAX ? `${nombre.slice(0, NOMBRE_MAX - 1).trimEnd()}…` : nombre;
  const periodo =
    input.periodStart === input.periodEnd
      ? diaCorto(input.periodStart)
      : `${diaCorto(input.periodStart)} a ${diaCorto(input.periodEnd)}`;

  const medioAsumido = input.method == null;
  const diferidoPorCierre = input.dia !== input.hoy;

  let reason = `Comisión ${corto} · ${periodo}`;
  if (medioAsumido) reason += " · medio no informado (asumido efectivo)";
  if (diferidoPorCierre) reason += ` · pagada el ${input.hoy}, día ya cerrado`;

  return {
    type: "EGRESO",
    method: input.method ?? MEDIO_ASUMIDO,
    amount,
    reason,
    createdBy: comisionMarker(input.payoutId),
    dia: input.dia,
    medioAsumido,
    diferidoPorCierre,
  };
}

/** Los medios que el formulario puede mandar. Se valida acá para no confiar en el borde. */
export function parseCashMethod(raw: unknown): CashMethod | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "EFECTIVO" || v === "MP" || v === "TARJETA" ? v : null;
}
