// ============================================================================
// CUENTAS A COBRAR Y A PAGAR — los números de las pantallas y del flujo de fondos. PURO.
// ============================================================================
//
// La pantalla del fiado, la de cuentas a pagar y el flujo de fondos cuentan la MISMA plata (y
// el botón de cada una en el Inicio, cuando tenga número). Si cada una armara su `where` y su
// suma, una diría "te deben $300.000" y la otra $280.000. Acá viven, una sola vez:
//   · qué cuentas están vivas (`whereCuentasAbiertas`) y qué cobros o pagos se les imputan
//     (`whereImputacionesDe`): lo que leen las pantallas y el flujo;
//   · el saldo de cada cuenta (`conSaldo`): total menos lo imputado, con la regla única del
//     saldo (`computeSettlement`);
//   · el resumen del fiado ("te deben $X · $Y con más de 30 días") y el de lo que hay que
//     pagar ("vence en 7 días: $X · N cheques a debitar").
//
// Los días se cuentan en el DÍA DEL NEGOCIO (hora argentina), no en UTC: un vencimiento
// guardado a la medianoche UTC del 1° es, en Buenos Aires, el 30 a las 21.
//
// Sin Prisma de valor: lo importan los tests, los loaders del Inicio y las pantallas.

import { round2 } from "@/lib/round";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { fmtMoneyARS } from "@/components/ui/format";
import { computeSettlement } from "@/lib/settlement/collection";
import { chequeCommitted, type ChequeStatus } from "./cheque";

// ── Los `where`, una vez ─────────────────────────────────────────────────────

/** Las cuentas vivas (no anuladas) del negocio. Igual para cobrar y para pagar. */
export function whereCuentasAbiertas(tenantId: string) {
  return { tenantId, status: "OPEN" as const };
}

/** Los cobros (fiado) o pagos (proveedor) imputados a cuentas del negocio. */
export function whereImputacionesDe(tenantId: string, originType: "RECEIVABLE" | "PAYABLE") {
  return { tenantId, originType };
}

// ── Días del negocio ─────────────────────────────────────────────────────────

/** "2026-09-23" + n días → "2026-09-30". Anclado al mediodía UTC: ningún corrimiento de zona. */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Días de calendario de `desde` a `hasta` (AAAA-MM-DD). Negativo si `hasta` es antes. */
export function diasEntre(desde: string, hasta: string): number {
  const utc = (d: string) => Date.parse(`${d}T12:00:00.000Z`);
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

/** El día del negocio de una fecha guardada, o `null`. */
export function diaDe(fecha: Date | null | undefined): string | null {
  return fecha ? dateStrInBusinessTz(fecha) : null;
}

// ── Saldo por cuenta ─────────────────────────────────────────────────────────

export interface CuentaLeida {
  id: string;
  /** Total de la deuda (ya en number: la conversión del Decimal va en el borde). */
  amount: number;
  issueDate: Date;
  dueDate: Date | null;
}

export interface CuentaConSaldo extends CuentaLeida {
  /** Lo cobrado (a cobrar) o pagado (a pagar) hasta ahora. */
  saldado: number;
  /** Lo que falta. Nunca negativo: un pago de más se ve en el detalle, no resta acá. */
  saldo: number;
}

/**
 * Cada cuenta con su saldo, desde lo imputado a cada una (`imputadoPorId`, la suma de sus
 * cobros o pagos). Misma regla que el detalle de la cuenta (`computeSettlement`). PURA.
 */
export function conSaldo<T extends CuentaLeida>(
  cuentas: readonly T[],
  imputadoPorId: ReadonlyMap<string, number>,
): (T & { saldado: number; saldo: number })[] {
  return cuentas.map((c) => {
    const s = computeSettlement(c.amount, [imputadoPorId.get(c.id) ?? 0]);
    return { ...c, saldado: s.collected, saldo: s.balance };
  });
}

/** Lo que devuelve un `groupBy` de imputaciones por `originId`, como mapa. PURA. */
export function imputadoPorCuenta(
  grupos: readonly { originId: string; _sum: { amount: unknown } }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of grupos) m.set(g.originId, aNumero(g._sum.amount));
  return m;
}

/** Decimal de Prisma, número o texto → number. `null`/basura → 0. PURA. */
export function aNumero(v: unknown): number {
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ── Fiado: "te deben $X · $Y con más de 30 días" ─────────────────────────────

/** Desde cuántos días de fiado una cuenta se considera vieja. */
export const DIAS_FIADO_VIEJO = 30;

export interface ResumenFiado {
  /** Lo que te deben, sumado. */
  total: number;
  /** Cuántas cuentas tienen saldo. */
  cuentas: number;
  /** De ese total, lo fiado hace más de 30 días (por la fecha de la deuda, no del vencimiento). */
  masDe30: number;
  /** Cuentas con más de 30 días y saldo. */
  cuentasMasDe30: number;
  /** De ese total, lo que tiene vencimiento y ya pasó. */
  vencido: number;
}

/**
 * El resumen del fiado. "Más de 30 días" se mide desde que se fió (`issueDate`), no desde el
 * vencimiento: el fiado de barrio casi nunca tiene vencimiento, y la pregunta de la dueña es
 * "¿hace cuánto que me debe?". Las cuentas saldadas no cuentan. PURA.
 */
export function resumirFiado(cuentas: readonly CuentaConSaldo[], hoy: string): ResumenFiado {
  let total = 0;
  let masDe30 = 0;
  let vencido = 0;
  let n = 0;
  let nViejas = 0;
  for (const c of cuentas) {
    if (!(c.saldo > 0)) continue;
    n++;
    total += c.saldo;
    const desde = diaDe(c.issueDate);
    if (desde && diasEntre(desde, hoy) > DIAS_FIADO_VIEJO) {
      masDe30 += c.saldo;
      nViejas++;
    }
    const vence = diaDe(c.dueDate);
    if (vence && vence < hoy) vencido += c.saldo;
  }
  return { total: round2(total), cuentas: n, masDe30: round2(masDe30), cuentasMasDe30: nViejas, vencido: round2(vencido) };
}

// ── Cuentas a pagar: lo que vence y los cheques ──────────────────────────────

export interface ChequeLeido {
  id: string;
  amount: number;
  dueDate: Date;
  status: ChequeStatus;
}

export interface CuentaAPagarLeida extends CuentaLeida {
  cheques: readonly ChequeLeido[];
}

/**
 * Una salida de plata que se espera: el saldo de una deuda que no está cubierto por un cheque
 * (sale el día que vence) o un cheque entregado que todavía no se debitó (sale el día del
 * cheque). Es lo que usan el resumen de cuentas a pagar y el flujo de fondos.
 */
export interface SalidaEsperada {
  cuentaId: string;
  tipo: "vencimiento" | "cheque";
  monto: number;
  /** Día del negocio en que sale, o `null` si la deuda no tiene vencimiento. */
  dia: string | null;
  chequeId?: string;
}

/**
 * Las salidas de plata de una deuda.
 *   · Cada cheque sin debitar (entregado o en la chequera) sale el día del cheque y por su
 *     monto ENTERO: es lo que el banco va a debitar. Antes se lo recortaba al saldo (un cheque
 *     de $100.000 contra una deuda que ya tenía $40.000 pagados salía por $60.000) y el flujo
 *     quedaba optimista justo en el caso que más duele: el banco debita los $100.000
 *     (payable-service.ts, `allowOverpay` del cheque debitado). Por lo mismo, un cheque sin
 *     debitar de una deuda ya saldada también sale.
 *   · Lo que queda del saldo sin cheque que lo cubra sale el día que vence (o sin día).
 * PURA.
 */
export function salidasDeCuenta(c: CuentaAPagarLeida & { saldo: number }): SalidaEsperada[] {
  const out: SalidaEsperada[] = [];
  const comprometidos = c.cheques
    .filter((ch) => chequeCommitted(ch.status) && ch.amount > 0)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  let cubierto = 0;
  for (const ch of comprometidos) {
    const monto = round2(ch.amount);
    out.push({ cuentaId: c.id, tipo: "cheque", monto, dia: diaDe(ch.dueDate), chequeId: ch.id });
    cubierto = round2(cubierto + monto);
  }
  const resta = round2(c.saldo - cubierto);
  if (resta > 0) out.push({ cuentaId: c.id, tipo: "vencimiento", monto: resta, dia: diaDe(c.dueDate) });
  return out;
}

/** Días hacia adelante que mira "vence en 7 días". */
export const DIAS_PROXIMOS_A_PAGAR = 7;

export interface ResumenAPagar {
  /** Lo que se debe, sumado. */
  total: number;
  cuentas: number;
  /** Lo que hay que pagar (sin cheque) con vencimiento de hoy a 7 días, más lo vencido. */
  venceEn7: number;
  /** De eso, lo que ya venció. */
  vencido: number;
  /** Cuentas con algo vencido. */
  cuentasVencidas: number;
  /**
   * Cheques ENTREGADOS al proveedor, sin debitar, con fecha de hoy a 7 días (o ya pasada). Los
   * que siguen en la chequera no: todavía no salieron del negocio y nadie los va a cobrar.
   */
  chequesADebitar: number;
  montoChequesADebitar: number;
  /** Todos los cheques sin debitar (entregados o en la chequera): la agenda del banco. */
  chequesPendientes: number;
  montoChequesPendientes: number;
}

/** El resumen de cuentas a pagar. `hoy` es el día del negocio. PURA. */
export function resumirAPagar(cuentas: readonly (CuentaAPagarLeida & { saldo: number })[], hoy: string): ResumenAPagar {
  const limite = sumarDias(hoy, DIAS_PROXIMOS_A_PAGAR);
  const r: ResumenAPagar = {
    total: 0,
    cuentas: 0,
    venceEn7: 0,
    vencido: 0,
    cuentasVencidas: 0,
    chequesADebitar: 0,
    montoChequesADebitar: 0,
    chequesPendientes: 0,
    montoChequesPendientes: 0,
  };
  for (const c of cuentas) {
    if (c.saldo > 0) {
      r.cuentas++;
      r.total += c.saldo;
    }
    const estado = new Map(c.cheques.map((ch) => [ch.id, ch.status]));
    let vencida = false;
    for (const s of salidasDeCuenta(c)) {
      if (s.tipo === "cheque") {
        r.chequesPendientes++;
        r.montoChequesPendientes += s.monto;
        if (estado.get(s.chequeId ?? "") === "DELIVERED" && s.dia !== null && s.dia <= limite) {
          r.chequesADebitar++;
          r.montoChequesADebitar += s.monto;
        }
        continue;
      }
      if (s.dia === null) continue;
      if (s.dia <= limite) r.venceEn7 += s.monto;
      if (s.dia < hoy) {
        r.vencido += s.monto;
        vencida = true;
      }
    }
    if (vencida) r.cuentasVencidas++;
  }
  r.total = round2(r.total);
  r.venceEn7 = round2(r.venceEn7);
  r.vencido = round2(r.vencido);
  r.montoChequesADebitar = round2(r.montoChequesADebitar);
  r.montoChequesPendientes = round2(r.montoChequesPendientes);
  return r;
}

// ── Un cheque nuevo no puede prometer más de lo que se debe ──────────────────

/**
 * ¿Se puede entregar un cheque por `monto` contra esta deuda? El saldo que ya cubren los
 * cheques sin debitar no se puede volver a cubrir: dos cheques por la misma plata terminan en
 * un pago de más cuando se debitan los dos (el débito se registra igual, porque es un hecho
 * del banco). PURA.
 */
export function validarChequeNuevo(input: {
  monto: number;
  saldo: number;
  chequesSinDebitar: number;
}): { ok: true; monto: number } | { ok: false; error: string } {
  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, error: "Poné el monto del cheque, mayor a cero." };
  }
  const monto = round2(input.monto);
  const libre = round2(input.saldo - input.chequesSinDebitar);
  if (!(libre > 0)) {
    return {
      ok: false,
      error: "Esta deuda ya está cubierta por los cheques que entregaste y todavía no se debitaron. Si uno se anuló o rebotó, marcalo primero.",
    };
  }
  if (monto > libre) {
    return {
      ok: false,
      error: `El cheque supera lo que falta cubrir de esta deuda: como máximo, ${fmtMoneyARS(libre)}.`,
    };
  }
  return { ok: true, monto };
}

// ── Un pago a mano no puede pagar lo que ya cubre un cheque ──────────────────

/**
 * El pago o el cheque no se registra por una regla de la deuda (los cheques sin debitar ya la
 * cubren, o el cheque supera lo que falta cubrir). El mensaje está escrito para la persona y
 * el formulario lo muestra tal cual (`mensajeDeRechazo`). Sin Prisma: lo tiran los servicios
 * adentro de su transacción y lo leen las actions.
 */
export class PagoRechazadoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "PagoRechazadoError";
  }
}

/**
 * ¿Se puede pagar `monto` a mano (efectivo, transferencia, Mercado Pago) a esta deuda? Lo que
 * ya cubren los cheques sin debitar no: el banco los va a debitar igual, y el pago a mano más
 * el débito pagan dos veces la misma plata. Es el espejo de `validarChequeNuevo`, que frena el
 * cheque después del pago; esta frena el pago después del cheque. Sin cheques sin debitar no
 * decide nada: queda la guarda de saldo de siempre (`validateNewCollection`). PURA.
 */
export function validarPagoAMano(input: {
  monto: number;
  saldo: number;
  chequesSinDebitar: number;
}): { ok: true } | { ok: false; error: string } {
  if (!(input.chequesSinDebitar > 0) || !Number.isFinite(input.monto)) return { ok: true };
  const libre = round2(input.saldo - input.chequesSinDebitar);
  if (!(libre > 0)) {
    return {
      ok: false,
      error:
        "Esta deuda ya está cubierta por cheques que todavía no se debitaron: un pago a mano la pagaría dos veces. Si un cheque rebotó o se anuló, marcalo primero.",
    };
  }
  if (round2(input.monto) > libre) {
    return {
      ok: false,
      error: `Los cheques sin debitar ya cubren ${fmtMoneyARS(round2(input.chequesSinDebitar))} de esta deuda: a mano podés pagar hasta ${fmtMoneyARS(libre)}.`,
    };
  }
  return { ok: true };
}
