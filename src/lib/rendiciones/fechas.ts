/**
 * RENDÍ — fechas ISO `AAAA-MM-DD` y períodos `AAAA-MM` (Core, PURO).
 *
 * El dominio no usa objetos Date: las fechas son strings ISO y "hoy" entra por parámetro.
 * La única aritmética de calendario (`diasEntre`) usa `Date.UTC`, que es determinística
 * (no depende del reloj ni del huso horario de la máquina).
 */

import type { FechaISO, Periodo } from "./tipos";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** ¿Es una fecha real con formato `AAAA-MM-DD`? (2026-02-30 no lo es). */
export function esFechaIso(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes);
}

function aUtc(f: FechaISO): number {
  const [a, m, d] = f.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

/** ¿La fecha cae en el período `AAAA-MM`? */
export function estaEnPeriodo(f: FechaISO, p: Periodo): boolean {
  return f.startsWith(`${p}-`);
}

/** 2026-09 → "2609" (lo usa la asignación contable). */
export function aamm(p: Periodo): string {
  return `${p.slice(2, 4)}${p.slice(5, 7)}`;
}

/** 2026-09-24 → "24/09/2026". */
export function formatearFecha(f: FechaISO): string {
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
}

/** 2026-09 → "septiembre de 2026". */
export function nombrePeriodo(p: Periodo): string {
  const mes = MESES[Number(p.slice(5, 7)) - 1] ?? p.slice(5, 7);
  return `${mes} de ${p.slice(0, 4)}`;
}
