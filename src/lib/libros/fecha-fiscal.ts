// ============================================================================
// FECHA FISCAL — el día y el mes con los que se declara, en hora argentina. PURO.
// ============================================================================
//
// Un comprobante se declara por el DÍA DEL NEGOCIO, no por el día del servidor. El servidor
// corre en UTC: a las 21:00 de Buenos Aires ya es el día siguiente. Los tres facturadores
// armaban la fecha con `new Date().getDate()` (hora del proceso), así que todo lo facturado
// entre las 21 y las 24 salía con fecha de mañana; el 31 a las 23:30 eso pasa la venta al
// período siguiente de IVA, de Ingresos Brutos y del monotributo, y nada lo muestra.
//
// El traductor correcto ya existía (`dateStrInBusinessTz`, datetime.ts) y el Libro IVA lo
// usaba desde antes (libro-iva.ts, `dateToIso`). Acá vive UNA vez para todos: facturadores,
// Libro IVA, cierre del mes y la facturación automática desde el extracto.
//
// Sin Prisma ni nada de servidor: lo importan client components (el selector de mes) y los
// tests lo ejecutan con reloj fijo.

import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";

/** "AAAAMMDD" (formato de ARCA y de `Invoice.fecha`) del día del negocio en que cae `ahora`. */
export function fechaFiscalDelDia(ahora: Date = new Date()): string {
  return dateStrInBusinessTz(ahora).replace(/-/g, "");
}

// ── Mes calendario ──────────────────────────────────────────────────────────
//
// El IVA se liquida por MES calendario (Ley 23.349, art. 27), no por una ventana de N días
// hacia atrás. Un mes se identifica con "AAAA-MM" en la zona del negocio.

/** "2026-08". */
export type MesKey = string;

/** ¿Es un mes válido "AAAA-MM"? Llega de la URL: nunca se confía en el texto. */
export function esMesKey(raw: string | null | undefined): raw is MesKey {
  const m = /^(\d{4})-(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  return y >= 2000 && y <= 2100 && mm >= 1 && mm <= 12;
}

/** El mes del negocio en que cae `ahora`. */
export function mesDelNegocio(ahora: Date = new Date()): MesKey {
  return dateStrInBusinessTz(ahora).slice(0, 7);
}

const dos = (n: number) => String(n).padStart(2, "0");

function partes(mes: MesKey): { y: number; m: number } {
  const [y, m] = mes.split("-").map(Number);
  return { y, m };
}

/** El mes `delta` meses antes (negativo) o después (positivo), sin desbordar el año. */
export function mesVecino(mes: MesKey, delta: number): MesKey {
  const { y, m } = partes(mes);
  const cero = y * 12 + (m - 1) + delta;
  return `${Math.floor(cero / 12)}-${dos((((cero % 12) + 12) % 12) + 1)}`;
}

/** Cantidad de días del mes (28 a 31). */
export function diasDelMes(mes: MesKey): number {
  const { y, m } = partes(mes);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Todo lo que hace falta para filtrar un mes, con los tres relojes que se usan. */
export interface BordesMes {
  mes: MesKey;
  /** "2026-09-01" y "2026-09-30": los días del negocio que abarca. */
  primerDia: string;
  ultimoDia: string;
  /** Para `Invoice.fecha` y `MovimientoImportado.fecha` (AAAAMMDD, texto de igual largo). */
  fiscal: { gte: string; lt: string };
  /** Para columnas de instante (`createdAt`, `occurredAt`): 00:00 del 1° y del 1° siguiente. */
  instantes: { gte: Date; lt: Date };
}

/**
 * Los bordes del mes, en hora del negocio. Septiembre toma del 1 al 30; el 31/08 a las
 * 23:30 argentinas NO entra aunque en UTC ya sea septiembre.
 */
export function bordesDelMes(mes: MesKey): BordesMes {
  const siguiente = mesVecino(mes, 1);
  const primerDia = `${mes}-01`;
  const ultimoDia = `${mes}-${dos(diasDelMes(mes))}`;
  return {
    mes,
    primerDia,
    ultimoDia,
    fiscal: { gte: `${mes.replace("-", "")}01`, lt: `${siguiente.replace("-", "")}01` },
    instantes: {
      gte: businessWallTimeToUtc(primerDia, "00:00"),
      lt: businessWallTimeToUtc(`${siguiente}-01`, "00:00"),
    },
  };
}

const NOMBRES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "agosto". */
export function nombreDelMes(mes: MesKey): string {
  return NOMBRES[partes(mes).m - 1] ?? mes;
}

/** "agosto 2026". */
export function etiquetaDelMes(mes: MesKey): string {
  return `${nombreDelMes(mes)} ${partes(mes).y}`;
}

/** "2026-08-31" → "31/08/2026". */
export function diaLegible(dia: string): string {
  const [y, m, d] = dia.split("-");
  return y && m && d ? `${d}/${m}/${y}` : dia;
}

// ── "¿Ya se facturó esta acreditación?" ─────────────────────────────────────
//
// Una venta cobrada por transferencia se factura el día de la venta, pero el banco la
// acredita uno o dos días hábiles después (un viernes a la noche entra el lunes). La
// detección exigía la MISMA fecha y el mismo total, así que la acreditación del día
// siguiente volvía a proponerse para facturar: dos comprobantes por una venta.
//
// Tolerancia: la factura puede ser de hasta 3 días ANTES de la acreditación (nunca después:
// no se factura lo que todavía no se cobró por esta vía). PROVISIONAL A CONFIRMAR con la
// contadora de MAGRA: 3 cubre un fin de semana largo; un feriado puente puede pedir más.
export const DIAS_TOLERANCIA_ACREDITACION = 3;

/** "20260901" menos `dias` → "20260829". Anclado a mediodía UTC: sin corrimientos de zona. */
export function restarDiasFiscal(aaaammdd: string, dias: number): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(aaaammdd);
  if (!m) return aaaammdd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  d.setUTCDate(d.getUTCDate() - dias);
  return `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}`;
}

/** Fechas de comprobante que cuentan como "ya facturada" para una acreditación del día dado. */
export function ventanaYaFacturada(
  fechaAcreditacion: string,
  dias: number = DIAS_TOLERANCIA_ACREDITACION,
): { gte: string; lte: string } {
  return { gte: restarDiasFiscal(fechaAcreditacion, dias), lte: fechaAcreditacion };
}
