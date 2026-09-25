// LA TIRA DEL PERÍODO Y LA SEMANA TIPO — los gráficos de Reportes de un mostrador (diseño nuevo).
//
// Puro: recibe lo que ya agrupó `agruparVentasMostrador` (sólo los días con ventas, en días del
// negocio) y el día de hoy del negocio; no lee la base ni el reloj. No calcula plata nueva: reparte
// en tramos los totales por día que ya salieron del reporte, y la suma de los tramos es el total.
//
// Dos preguntas del dueño, una por gráfico:
//   - «¿Cómo vino el período?» → la tira: un palo por día (30 días), por semana (90 y 180) o por
//     mes (1 año). El tramo que incluye hoy, y los que no cubren su semana o su mes entero, van
//     marcados como parciales: compararlos contra uno completo sería mentir.
//   - «¿Qué día se vende más?» → la semana tipo: el promedio de cada día de la semana, contado desde
//     el primer día con ventas del período y sin hoy (que todavía no terminó). Es lo que usa la
//     carnicera para saber cuánto preparar el viernes para el sábado.

import type { FilaPorDia } from "@/lib/reports/ventas-mostrador";

export type Unidad = "dia" | "semana" | "mes";

export interface Tramo {
  /** Primer día del tramo dentro del período (YYYY-MM-DD). */
  desde: string;
  /** Último día del tramo dentro del período (YYYY-MM-DD). */
  hasta: string;
  total: number;
  cantidad: number;
  /** No cubre su día, semana o mes entero (el primero, el último o el de hoy). */
  parcial: boolean;
  /** Incluye hoy: todavía se está vendiendo. */
  enCurso: boolean;
  /** Alto del palo, de 0 a 1 contra el tramo más alto. */
  alto: number;
  /** Para leer en voz alta y en el globo: «semana del 15/09 al 21/09». */
  etiqueta: string;
  /** Para el pie del gráfico: «15/09», «sep». */
  corta: string;
}

export interface Tira {
  unidad: Unidad;
  tramos: Tramo[];
  /** El tramo completo que más vendió (null si no hubo ventas). */
  mejor: Tramo | null;
}

export interface DiaTipo {
  nombre: string;
  /** Cuántos de esos días hubo en el período (desde el primero con ventas, sin hoy). */
  ocurrencias: number;
  /** Lo vendido en promedio ese día de la semana. */
  promedio: number;
  /** Ventas en promedio ese día de la semana. */
  ventasPromedio: number;
  /** Largo de la raya, de 0 a 1 contra el día que más vende. */
  proporcion: number;
}

export interface SemanaTipo {
  /** De lunes a domingo. */
  dias: DiaTipo[];
  /** Índice (0 = lunes) del día que más vende en promedio, o null si no hubo ventas. */
  mejor: number | null;
  /** Primer día contado (el primero con ventas del período), o null si no hubo ventas. */
  desde: string | null;
}

const DIA_MS = 86_400_000;
const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
const DIA_CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

function aMs(dia: string): number {
  const [y, m, d] = dia.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function aDia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function diaDeLaSemana(dia: string): number {
  return (new Date(aMs(dia)).getUTCDay() + 6) % 7;
}

function ddmm(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Los días del período, del más viejo a hoy: `dias` días contando hoy (como `bordesDelPeriodo`). */
export function diasDelPeriodo(hoy: string, dias: number): string[] {
  const fin = aMs(hoy);
  const out: string[] = [];
  for (let i = dias - 1; i >= 0; i--) out.push(aDia(fin - i * DIA_MS));
  return out;
}

/** Día para 30 días; semana para 90 y 180; mes para un año. */
export function unidadPara(dias: number): Unidad {
  if (dias <= 31) return "dia";
  if (dias <= 190) return "semana";
  return "mes";
}

function claveDelTramo(dia: string, unidad: Unidad): string {
  if (unidad === "dia") return dia;
  if (unidad === "mes") return dia.slice(0, 7);
  return aDia(aMs(dia) - diaDeLaSemana(dia) * DIA_MS); // el lunes de esa semana
}

function largoDeLaUnidad(desde: string, unidad: Unidad): number {
  if (unidad === "dia") return 1;
  if (unidad === "semana") return 7;
  const [y, m] = desde.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // días del mes
}

/** «jue 24/09». */
export function diaConNombre(dia: string): string {
  return `${DIA_CORTO[diaDeLaSemana(dia)]} ${ddmm(dia)}`;
}

function etiquetas(desde: string, hasta: string, unidad: Unidad, parcial: boolean): { etiqueta: string; corta: string } {
  if (unidad === "dia") {
    return { etiqueta: diaConNombre(desde), corta: ddmm(desde) };
  }
  if (unidad === "semana") {
    return { etiqueta: `semana del ${ddmm(desde)} al ${ddmm(hasta)}`, corta: ddmm(desde) };
  }
  const mes = Number(desde.slice(5, 7)) - 1;
  const base = `${MES_LARGO[mes]} ${desde.slice(0, 4)}`;
  return {
    etiqueta: parcial ? `${base} (del ${ddmm(desde)} al ${ddmm(hasta)})` : base,
    corta: MES_CORTO[mes],
  };
}

/** Reparte los días con ventas en tramos del período; los días sin ventas suman cero. */
export function armarTira(porDia: readonly FilaPorDia[], hoy: string, dias: number): Tira {
  const unidad = unidadPara(dias);
  const delDia = new Map(porDia.map((f) => [f.dia, f]));
  const grupos = new Map<string, { dias: string[]; total: number; cantidad: number }>();
  for (const dia of diasDelPeriodo(hoy, dias)) {
    const clave = claveDelTramo(dia, unidad);
    const g = grupos.get(clave) ?? { dias: [], total: 0, cantidad: 0 };
    const f = delDia.get(dia);
    g.dias.push(dia);
    g.total += f?.total ?? 0;
    g.cantidad += f?.cantidad ?? 0;
    grupos.set(clave, g);
  }

  const max = Math.max(0, ...[...grupos.values()].map((g) => g.total));
  const tramos: Tramo[] = [...grupos.values()].map((g) => {
    const desde = g.dias[0];
    const hasta = g.dias[g.dias.length - 1];
    const enCurso = hasta === hoy;
    const parcial = enCurso || g.dias.length < largoDeLaUnidad(desde, unidad);
    return {
      desde,
      hasta,
      total: g.total,
      cantidad: g.cantidad,
      parcial,
      enCurso,
      alto: max > 0 ? g.total / max : 0,
      ...etiquetas(desde, hasta, unidad, parcial),
    };
  });

  const candidatos = tramos.some((t) => !t.parcial && t.total > 0) ? tramos.filter((t) => !t.parcial) : tramos;
  const mejor = candidatos.reduce<Tramo | null>((m, t) => (t.total > 0 && (!m || t.total > m.total) ? t : m), null);
  return { unidad, tramos, mejor };
}

/** El promedio de cada día de la semana, desde el primer día con ventas del período y sin hoy. */
export function armarSemanaTipo(porDia: readonly FilaPorDia[], hoy: string, dias: number): SemanaTipo {
  const delDia = new Map(porDia.map((f) => [f.dia, f]));
  const periodo = diasDelPeriodo(hoy, dias).filter((d) => d !== hoy);
  const primero = periodo.findIndex((d) => (delDia.get(d)?.total ?? 0) > 0 || (delDia.get(d)?.cantidad ?? 0) > 0);
  const contados = primero === -1 ? [] : periodo.slice(primero);

  const acum = NOMBRES_DIA.map(() => ({ ocurrencias: 0, total: 0, cantidad: 0 }));
  for (const d of contados) {
    const a = acum[diaDeLaSemana(d)];
    a.ocurrencias += 1;
    a.total += delDia.get(d)?.total ?? 0;
    a.cantidad += delDia.get(d)?.cantidad ?? 0;
  }
  const promedios = acum.map((a) => (a.ocurrencias > 0 ? a.total / a.ocurrencias : 0));
  const max = Math.max(0, ...promedios);
  const dias7: DiaTipo[] = acum.map((a, i) => ({
    nombre: NOMBRES_DIA[i],
    ocurrencias: a.ocurrencias,
    promedio: promedios[i],
    ventasPromedio: a.ocurrencias > 0 ? a.cantidad / a.ocurrencias : 0,
    proporcion: max > 0 ? promedios[i] / max : 0,
  }));
  const mejor = max > 0 ? promedios.indexOf(max) : null;
  return { dias: dias7, mejor, desde: contados[0] ?? null };
}

/** «62 %», «<1 %» (hubo algo, pero redondea a cero) o «0 %». */
export function porcentajeLegible(parte: number, total: number): string {
  if (total <= 0 || parte <= 0) return "0 %";
  const p = Math.round((parte / total) * 100);
  return p === 0 ? "<1 %" : `${p} %`;
}

/** Largo de una raya de 0 a 1 contra el máximo (0 si no hay máximo). */
export function proporcion(valor: number, max: number): number {
  if (max <= 0 || valor <= 0) return 0;
  return Math.min(1, valor / max);
}

/** «4,5» con coma y a lo sumo un decimal. */
export function unDecimal(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}
