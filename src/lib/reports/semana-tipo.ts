// ============================================================================
// LA SEMANA TIPO — qué día se vende más, y cuánto pesan los días que vienen.
// ============================================================================
//
// Lo usan dos pantallas con la MISMA cuenta:
//   · Reportes de un mostrador (reportes/tira-core.ts la re-exporta): el promedio de cada día de
//     la semana, contado desde el primer día con ventas del período y sin hoy (que no terminó).
//   · El sugerido de compra (suppliers/sugerido.ts): si los días que tiene que cubrir el pedido
//     son los que más venden (viernes y sábado en una carnicería), se pide un poco más; si son
//     los flojos, un poco menos. Es `factorDeLaVentana`, entre 0,5 y 2.
//
// Los días son días DEL NEGOCIO ("YYYY-MM-DD" en su zona horaria, `dateStrInBusinessTz`), no UTC:
// una venta de las 22 h del viernes es del viernes aunque en UTC ya sea sábado. Acá sólo se hace
// aritmética de calendario sobre esas claves.
//
// PURO: sin base ni reloj.

import type { FilaPorDia } from "@/lib/reports/ventas-mostrador";

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
export const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

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

/** El día `n` días después (o antes, con `n` negativo) de `dia`. */
export function sumarDias(dia: string, n: number): string {
  return aDia(aMs(dia) + n * DIA_MS);
}

/** Los días del período, del más viejo a hoy: `dias` días contando hoy (como `bordesDelPeriodo`). */
export function diasDelPeriodo(hoy: string, dias: number): string[] {
  const out: string[] = [];
  for (let i = dias - 1; i >= 0; i--) out.push(sumarDias(hoy, -i));
  return out;
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

// ── El perfil de la semana y el factor de los días que vienen ────────────────

/** Con menos días con venta que esto, la semana tipo no dice nada todavía: el factor es 1. */
export const DIAS_MINIMOS_PARA_PERFIL = 14;
export const FACTOR_MINIMO = 0.5;
export const FACTOR_MAXIMO = 2;

export interface PerfilSemanal {
  /** De lunes a domingo: lo que vende ese día contra el día promedio (1 = un día común). */
  pesos: number[];
  /** Días con alguna venta en el período (sin hoy). */
  diasConVenta: number;
}

/**
 * El peso de cada día de la semana: su promedio (de la semana tipo) dividido el promedio de los
 * siete. Un sábado que vende el doble que el día promedio pesa 2; un domingo cerrado, 0. PURA.
 */
export function perfilSemanal(porDia: readonly FilaPorDia[], hoy: string, dias: number): PerfilSemanal {
  const semana = armarSemanaTipo(porDia, hoy, dias);
  const enElPeriodo = new Set(diasDelPeriodo(hoy, dias).filter((d) => d !== hoy));
  const diasConVenta = porDia.filter((f) => enElPeriodo.has(f.dia) && (f.total > 0 || f.cantidad > 0)).length;
  const media = semana.dias.reduce((s, d) => s + d.promedio, 0) / 7;
  const pesos = semana.dias.map((d) => (media > 0 ? d.promedio / media : 1));
  return { pesos, diasConVenta };
}

/**
 * Cuánto más (o menos) que un período común venden los `largo` días que vienen, desde mañana: el
 * promedio de sus pesos, entre 0,5 y 2. Con menos de DIAS_MINIMOS_PARA_PERFIL días con venta da 1
 * (no se ajusta con dos semanas de datos sueltos). PURA.
 */
export function factorDeLaVentana(perfil: PerfilSemanal, hoy: string, largo: number): number {
  if (perfil.diasConVenta < DIAS_MINIMOS_PARA_PERFIL || !(largo > 0)) return 1;
  let suma = 0;
  for (let i = 1; i <= largo; i++) suma += perfil.pesos[diaDeLaSemana(sumarDias(hoy, i))] ?? 1;
  const factor = suma / largo;
  if (!Number.isFinite(factor)) return 1;
  return Math.min(FACTOR_MAXIMO, Math.max(FACTOR_MINIMO, Math.round(factor * 100) / 100)); // no-es-plata: un factor de demanda con dos decimales
}
