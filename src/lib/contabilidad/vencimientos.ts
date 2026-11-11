/**
 * Motor de vencimientos fiscales (Contabilidad, ola 1 — docs/producto/contabilidad/PLAN.md §5).
 *
 * PURO: no sabe fechas. Lee una `TablaVencimientos` (parámetro; la de ejemplo es
 * `tabla-vencimientos-2026.ts`, «provisional a confirmar») y una lista de feriados configurable,
 * y devuelve la fecha de cada obligación para un CUIT y un período. Si la fecha cae sábado,
 * domingo o feriado, corre al día hábil siguiente.
 *
 * La terminación del CUIT sale del CUIT del negocio (ADR-066); acá se recibe el CUIT entero y se
 * valida con el validador único del repo (`@/lib/cuit`, dígito verificador módulo 11).
 *
 * Fechas: días civiles representados como `Date` a las 00:00 UTC (lo que guarda una columna DATE).
 * «Vencido» NO se guarda: lo deriva `estadoEfectivo` comparando con la fecha de hoy en Argentina.
 */

import { cuitValido, normalizarCuit } from "@/lib/cuit";

export type Periodicidad = "MENSUAL" | "ANUAL" | "SEMESTRAL" | "ANTICIPO";
export type AccionObligacion = "PRESENTACION" | "PAGO" | "AMBAS";
export type EstadoVencimiento =
  | "PENDIENTE"
  | "EN_CURSO"
  | "PRESENTADO"
  | "PAGADO"
  | "SIN_SALDO"
  | "NO_CORRESPONDE"
  | "VERIFICADO";
export const ESTADOS_VENCIMIENTO: readonly EstadoVencimiento[] = [
  "PENDIENTE",
  "EN_CURSO",
  "PRESENTADO",
  "PAGADO",
  "SIN_SALDO",
  "NO_CORRESPONDE",
  "VERIFICADO",
];
/** Lo que ve la pantalla: el estado guardado o VENCIDO, que se calcula. */
export type EstadoEfectivo = EstadoVencimiento | "VENCIDO";

/** Cuota 0 = vencimiento único (sin cuotas). Los anticipos usan 1..n. */
export const SIN_CUOTA = 0;

export interface CuotaDePeriodo {
  cuota: number;
  /** Mes en que vence, `YYYY-MM`. */
  mes: string;
}

export interface ObligacionEnTabla {
  codigo: string;
  nombre: string;
  organismo: string;
  jurisdiccion?: string | null;
  periodicidad: Periodicidad;
  accion: AccionObligacion;
  /**
   * Si se prende sola al sembrar (default true). Las que dependen del perfil fiscal (agente de
   * retención, por ejemplo) entran apagadas y se prenden en el monitor.
   */
  activaPorDefecto?: boolean;
  /** Sólo MENSUAL: el período `YYYY-MM` vence N meses después (IVA de marzo → abril = 1). */
  mesesHastaVencimiento?: number;
  /** ANUAL / SEMESTRAL / ANTICIPO: período `YYYY` → cuotas con su mes de vencimiento. */
  porPeriodo?: Readonly<Record<string, readonly CuotaDePeriodo[]>>;
  /** Mes de vencimiento `YYYY-MM` → día por terminación de CUIT (índice 0-9). */
  diasPorMes: Readonly<Record<string, readonly number[]>>;
}

export interface TablaVencimientos {
  anio: number;
  provisional: boolean;
  obligaciones: readonly ObligacionEnTabla[];
}

export interface VencimientoCalculado {
  codigo: string;
  periodo: string;
  cuota: number;
  /** Día hábil en que vence (ya corrido si hacía falta). */
  fechaVencimiento: Date;
  /** Día que dice la tabla, antes de correrlo. */
  fechaSegunTabla: Date;
  corrido: boolean;
  accion: AccionObligacion;
}

export type ResultadoVencimientos =
  | { ok: true; terminacion: number; vencimientos: VencimientoCalculado[]; avisos: string[] }
  | { ok: false; error: "CUIT_INVALIDO" | "PERIODO_INVALIDO"; mensaje: string };

const RE_MENSUAL = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RE_ANUAL = /^\d{4}$/;

/** `YYYY-MM-DD` de un `Date` en UTC (columna DATE). */
export function diaIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fechaUtc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function sumarMeses(periodo: string, meses: number): string {
  const [a, m] = periodo.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Corre la fecha al primer día hábil (ni sábado, ni domingo, ni feriado) desde ella inclusive. */
export function habilDesde(fecha: Date, feriados: ReadonlySet<string> = new Set()): Date {
  const d = new Date(fecha.getTime());
  for (let i = 0; i < 31; i++) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !feriados.has(diaIso(d))) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new Error("No hay un día hábil en el mes siguiente: revisá la lista de feriados.");
}

/** Cuotas (con mes de vencimiento) que una obligación tiene para el período, o null si no aplica. */
function cuotasDe(ob: ObligacionEnTabla, periodo: string): CuotaDePeriodo[] | null {
  if (ob.periodicidad === "MENSUAL") {
    if (!RE_MENSUAL.test(periodo)) return null;
    return [{ cuota: SIN_CUOTA, mes: sumarMeses(periodo, ob.mesesHastaVencimiento ?? 1) }];
  }
  if (!RE_ANUAL.test(periodo)) return null;
  const cuotas = ob.porPeriodo?.[periodo];
  return cuotas ? [...cuotas] : null;
}

/**
 * Vencimientos de un CUIT para un período. `periodo` es `YYYY-MM` (obligaciones mensuales) o
 * `YYYY` (anuales, semestrales y anticipos). Los meses que la tabla no trae se informan en
 * `avisos` en vez de inventar una fecha.
 */
export function calcularVencimientos(
  cuit: string,
  periodo: string,
  tabla: TablaVencimientos,
  feriados: Iterable<string> = [],
  codigos?: readonly string[],
): ResultadoVencimientos {
  if (!cuitValido(cuit)) {
    return { ok: false, error: "CUIT_INVALIDO", mensaje: "El CUIT no es válido. Copialo de la constancia de inscripción de ARCA." };
  }
  if (!RE_MENSUAL.test(periodo) && !RE_ANUAL.test(periodo)) {
    return { ok: false, error: "PERIODO_INVALIDO", mensaje: "El período tiene que ser un mes (AAAA-MM) o un año (AAAA)." };
  }
  const terminacion = Number(normalizarCuit(cuit).slice(-1));
  const fer = new Set(feriados);
  const vencimientos: VencimientoCalculado[] = [];
  const avisos: string[] = [];

  for (const ob of tabla.obligaciones) {
    if (codigos && !codigos.includes(ob.codigo)) continue;
    const cuotas = cuotasDe(ob, periodo);
    if (!cuotas) continue;
    for (const { cuota, mes } of cuotas) {
      const dia = ob.diasPorMes[mes]?.[terminacion];
      if (!dia) {
        avisos.push(`${ob.nombre}: la tabla no trae el día de ${mes}; cargalo antes de usar el calendario.`);
        continue;
      }
      const [a, m] = mes.split("-").map(Number);
      const segunTabla = fechaUtc(a, m, dia);
      const fecha = habilDesde(segunTabla, fer);
      vencimientos.push({
        codigo: ob.codigo,
        periodo,
        cuota,
        fechaVencimiento: fecha,
        fechaSegunTabla: segunTabla,
        corrido: fecha.getTime() !== segunTabla.getTime(),
        accion: ob.accion,
      });
    }
  }
  return { ok: true, terminacion, vencimientos, avisos };
}

/** Fecha civil de hoy en Argentina, como DATE (00:00 UTC). */
export function hoyEnArgentina(ahora: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return new Date(`${s}T00:00:00Z`);
}

/**
 * Estado que se muestra: VENCIDO si la fecha ya pasó (el día del vencimiento todavía no está
 * vencido) y sigue PENDIENTE o EN_CURSO. Cualquier otro estado se muestra tal cual.
 */
export function estadoEfectivo(
  venc: { fechaVencimiento: Date; estado: EstadoVencimiento },
  ahora: Date = new Date(),
): EstadoEfectivo {
  const abierto = venc.estado === "PENDIENTE" || venc.estado === "EN_CURSO";
  if (!abierto) return venc.estado;
  return diaIso(hoyEnArgentina(ahora)) > diaIso(venc.fechaVencimiento) ? "VENCIDO" : venc.estado;
}
