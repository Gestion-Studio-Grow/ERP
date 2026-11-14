// ============================================================================
// EL PERÍODO DE UNA LIQUIDACIÓN DE COMISIONES — qué turnos entran al cortar. PURO.
// ============================================================================
//
// Spec: docs/producto/comisiones/LIQUIDACION.md §2 y §5-T1. Hasta acá la liquidación juntaba
// «todo lo pendiente hasta hoy»; ahora Caro elige el período («Octubre 2026», «1–15 nov») y ve
// el detalle antes de liquidar. Sin migración: el período no se guarda, sólo corta.
//
// LA REGLA DEL CORTE. Entra todo turno pendiente (COMPLETED, saldado, sin liquidar) con
// `startsAt` ANTES del fin del período, en la zona del negocio: el de las 23:59 del último día
// entra, el de las 00:00 del día siguiente no. No hay borde de abajo a propósito: un turno de un
// período anterior que se saldó tarde «entra al período en que se liquide» (§2), no se pierde; la
// vista previa lo marca como «de antes». Es la misma regla para la vista previa y para
// `settleCommissions`: las dos llaman a `entraEnElCorte`.
//
// DEFAULTS PROVISIONALES A CONFIRMAR (§6.1): el período del negocio es MES (no hay columna
// `BusinessSettings.commissionPeriod` sin la migración de T2) y la pantalla abre en el último
// período ya cerrado (el mes pasado): liquidar es cerrar el mes que terminó.

import { businessWallTimeToUtc } from "@/lib/datetime";

export type TipoPeriodo = "MES" | "QUINCENA" | "SEMANA";

/** Provisional a confirmar (§6.1): el período de CH. Sin la columna de T2, todos los negocios. */
export const TIPO_DE_PERIODO_POR_DEFECTO: TipoPeriodo = "MES";

export interface PeriodoComision {
  tipo: TipoPeriodo;
  /** «2026-10», «2026-11-Q1», «2026-W44»: lo que viaja en la URL y en el formulario. */
  clave: string;
  /** Primer día (YYYY-MM-DD, zona del negocio). */
  desde: string;
  /** Último día, inclusive. */
  hasta: string;
  /** El día siguiente al último: el corte (exclusivo). */
  corte: string;
  /** «Octubre 2026», «1 al 15 de noviembre 2026», «Semana del 26/10 al 1/11». */
  etiqueta: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const dos = (n: number) => String(n).padStart(2, "0");
/** Fecha de calendario en UTC puro (sin zona): sólo para aritmética de días. */
const fecha = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const clave = (f: Date) => `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;
const masDias = (dia: string, n: number) => {
  const [y, m, d] = dia.split("-").map(Number);
  return clave(fecha(y, m, d + n));
};
const ultimoDelMes = (y: number, m: number) => fecha(y, m + 1, 0).getUTCDate();
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** ¿Es un día real («2026-02-30» no)? */
function diaValido(dia: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return false;
  return clave(fecha(Number(m[1]), Number(m[2]), Number(m[3]))) === dia;
}

function delMes(y: number, m: number): PeriodoComision {
  const desde = clave(fecha(y, m, 1));
  const hasta = clave(fecha(y, m, ultimoDelMes(y, m)));
  return { tipo: "MES", clave: `${y}-${dos(m)}`, desde, hasta, corte: masDias(hasta, 1), etiqueta: `${capital(MESES[m - 1])} ${y}` };
}

function deQuincena(y: number, m: number, q: 1 | 2): PeriodoComision {
  const ultimo = ultimoDelMes(y, m);
  const [d1, d2] = q === 1 ? [1, 15] : [16, ultimo];
  const hasta = clave(fecha(y, m, d2));
  return {
    tipo: "QUINCENA",
    clave: `${y}-${dos(m)}-Q${q}`,
    desde: clave(fecha(y, m, d1)),
    hasta,
    corte: masDias(hasta, 1),
    etiqueta: `${d1} al ${d2} de ${MESES[m - 1]} ${y}`,
  };
}

/** Lunes de la semana ISO `w` del año ISO `y`. */
function lunesIso(y: number, w: number): Date {
  const cuatroDeEnero = fecha(y, 1, 4);
  const diaSemana = cuatroDeEnero.getUTCDay() || 7; // 1 = lunes … 7 = domingo
  return fecha(y, 1, 4 - (diaSemana - 1) + (w - 1) * 7);
}

/** Año y semana ISO del día. */
function semanaIso(dia: string): { y: number; w: number } {
  const [y, m, d] = dia.split("-").map(Number);
  const f = fecha(y, m, d);
  const diaSemana = f.getUTCDay() || 7;
  const jueves = fecha(y, m, d + 4 - diaSemana); // el jueves decide el año ISO
  const yIso = jueves.getUTCFullYear();
  const w = Math.floor((jueves.getTime() - fecha(yIso, 1, 1).getTime()) / 86_400_000 / 7) + 1;
  return { y: yIso, w };
}

const corto = (dia: string) => {
  const [, m, d] = dia.split("-").map(Number);
  return `${d}/${m}`;
};

function deSemana(y: number, w: number): PeriodoComision {
  const lunes = lunesIso(y, w);
  const desde = clave(lunes);
  const hasta = masDias(desde, 6);
  return { tipo: "SEMANA", clave: `${y}-W${dos(w)}`, desde, hasta, corte: masDias(hasta, 1), etiqueta: `Semana del ${corto(desde)} al ${corto(hasta)}` };
}

/** El período de esa clave, o `null` si no es una clave válida. Llega de la URL: no se confía. */
export function leerPeriodo(raw: unknown): PeriodoComision | null {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mes] = [Number(m[1]), Number(m[2])];
    return mes >= 1 && mes <= 12 && y >= 2000 && y <= 2100 ? delMes(y, mes) : null;
  }
  m = /^(\d{4})-(\d{2})-Q([12])$/.exec(s);
  if (m) {
    const [y, mes] = [Number(m[1]), Number(m[2])];
    return mes >= 1 && mes <= 12 && y >= 2000 && y <= 2100 ? deQuincena(y, mes, Number(m[3]) as 1 | 2) : null;
  }
  m = /^(\d{4})-W(\d{2})$/.exec(s);
  if (m) {
    const [y, w] = [Number(m[1]), Number(m[2])];
    if (y < 2000 || y > 2100 || w < 1 || w > 53) return null;
    const p = deSemana(y, w);
    return semanaIso(p.desde).y === y && semanaIso(p.desde).w === w ? p : null; // W53 sólo si existe
  }
  return null;
}

/** El período de ese tipo que contiene el día (YYYY-MM-DD, zona del negocio). */
export function periodoQueContiene(dia: string, tipo: TipoPeriodo = TIPO_DE_PERIODO_POR_DEFECTO): PeriodoComision {
  if (!diaValido(dia)) throw new Error(`Día inválido: ${dia}`);
  const [y, m, d] = dia.split("-").map(Number);
  if (tipo === "MES") return delMes(y, m);
  if (tipo === "QUINCENA") return deQuincena(y, m, d <= 15 ? 1 : 2);
  const s = semanaIso(dia);
  return deSemana(s.y, s.w);
}

export const periodoAnterior = (p: PeriodoComision) => periodoQueContiene(masDias(p.desde, -1), p.tipo);
export const periodoSiguiente = (p: PeriodoComision) => periodoQueContiene(p.corte, p.tipo);

/**
 * Con qué período abre la pantalla: el de la URL si es válido; si no, el último ya cerrado (el mes
 * pasado). Provisional a confirmar (§6.1).
 */
export function periodoElegido(raw: unknown, hoy: string, tipo: TipoPeriodo = TIPO_DE_PERIODO_POR_DEFECTO): PeriodoComision {
  return leerPeriodo(raw) ?? periodoAnterior(periodoQueContiene(hoy, tipo));
}

/** Los bordes en UTC: medianoche del primer día y del día del corte, en la zona del negocio. */
export function bordesDelPeriodo(p: PeriodoComision): { desde: Date; corte: Date } {
  return { desde: businessWallTimeToUtc(p.desde, "00:00"), corte: businessWallTimeToUtc(p.corte, "00:00") };
}

/**
 * ¿El turno entra en la liquidación cortada en este período? Todo lo de antes del corte entra (lo
 * saldado tarde no se pierde). La MISMA regla en la vista previa y en `settleCommissions`.
 */
export function entraEnElCorte(startsAt: Date, p: PeriodoComision): boolean {
  return startsAt.getTime() < bordesDelPeriodo(p).corte.getTime();
}

/** ¿El turno es de un período anterior (arrastrado)? Sólo para marcarlo en pantalla. */
export function esDeAntes(startsAt: Date, p: PeriodoComision): boolean {
  return startsAt.getTime() < bordesDelPeriodo(p).desde.getTime();
}
