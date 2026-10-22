// Lo puro de Hoy, Semana y Agendar (Tanda 3A · matias-DISENO.md §2.3): la cinta de días, la línea
// del día (clases + huecos + bloqueos en orden de hora), el pedido urgente, el rótulo de la semana,
// el deslizar de costado y el alto del teclado del celular. Sin React ni Next: lo prueba
// _agenda-core.test.ts.

import { businessWallTimeToUtc } from "@/lib/datetime";
import { diaCorto, horaHumana, sumarDias } from "@/lib/padel/core";
import { BASE_CLASES } from "./_navegacion";

/** Los días de la cinta: «Hoy», «Mañana», «jue 24», … (`n` días desde `hoy`). */
export function diasDeCinta(hoy: string, n = 14): { fecha: string; etiqueta: string }[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const fecha = sumarDias(hoy, i);
    return { fecha, etiqueta: i === 0 ? "Hoy" : i === 1 ? "Mañana" : diaCorto(fecha) };
  });
}

/** Agendar con lo que ya se sabe (el hueco tocado: día y hora; la ficha: el alumno). */
export function hrefAgendar(p: { fecha?: string; hora?: string; alumno?: string } = {}): string {
  const q = new URLSearchParams();
  if (p.fecha) q.set("fecha", p.fecha);
  if (p.hora) q.set("hora", p.hora);
  if (p.alumno) q.set("alumno", p.alumno);
  const s = q.toString();
  return `${BASE_CLASES}/agendar${s ? `?${s}` : ""}`;
}

type ConHora = { empiezaEn: Date | string };

export type ItemLinea<C extends ConHora> =
  | { tipo: "clase"; clave: string; t: number; hora: string; clase: C }
  | { tipo: "hueco"; clave: string; t: number; hora: string; iso: string }
  | { tipo: "bloqueo"; clave: string; t: number; desde: string; hasta: string; todoElDia: boolean };

const TODO_EL_DIA = (desde: string, hasta: string) => desde <= "00:00" && hasta >= "23:59";

/**
 * La línea del día (Semana y «El resto de hoy»): clases, huecos libres y bloqueos, en orden de
 * hora. Un bloqueo de día entero va primero. A igual hora, la clase antes que el hueco (no debería
 * pasar: un hueco es lo que NO tiene clase).
 */
export function lineaDelDia<C extends ConHora & { id: string }>(p: {
  fecha: string;
  clases: readonly C[];
  huecos: readonly string[];
  bloqueos?: readonly { id: string; desde: string; hasta: string }[];
}): ItemLinea<C>[] {
  const items: ItemLinea<C>[] = [
    ...p.clases.map((c) => {
      const d = new Date(c.empiezaEn);
      return { tipo: "clase" as const, clave: `c-${c.id}`, t: d.getTime(), hora: horaHumana(d), clase: c };
    }),
    ...p.huecos.map((iso) => {
      const d = new Date(iso);
      return { tipo: "hueco" as const, clave: `h-${iso}`, t: d.getTime(), hora: horaHumana(d), iso };
    }),
    ...(p.bloqueos ?? []).map((b) => {
      const todoElDia = TODO_EL_DIA(b.desde, b.hasta);
      return {
        tipo: "bloqueo" as const,
        clave: `b-${b.id}`,
        t: todoElDia ? Number.NEGATIVE_INFINITY : businessWallTimeToUtc(p.fecha, b.desde).getTime(),
        desde: b.desde,
        hasta: b.hasta,
        todoElDia,
      };
    }),
  ];
  const orden = { bloqueo: 0, clase: 1, hueco: 2 } as const;
  return items.sort((a, b) => a.t - b.t || orden[a.tipo] - orden[b.tipo]);
}

/** Un pedido que empieza en menos de `umbralMin` (3 h): va arriba en rojo (M-063). */
export function esUrgente(empiezaEn: Date | string, ahora: Date, umbralMin = 180): boolean {
  const falta = new Date(empiezaEn).getTime() - ahora.getTime();
  return falta > 0 && falta <= umbralMin * 60_000;
}

/** «en 40 min», «en 2 h», «en 1 h 30»: cuánto falta, para el pedido urgente. */
export function faltaPara(empiezaEn: Date | string, ahora: Date): string {
  const min = Math.max(0, Math.round((new Date(empiezaEn).getTime() - ahora.getTime()) / 60_000));
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `en ${h} h ${String(resto).padStart(2, "0")}` : `en ${h} h`;
}

const MES = (fecha: string) =>
  new Date(`${fecha}T12:00:00.000Z`).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
const DIA_DEL_MES = (fecha: string) => new Date(`${fecha}T12:00:00.000Z`).getUTCDate();

/** «20 – 26 oct» (o «27 oct – 2 nov» si la semana cruza de mes), desde el lunes. */
export function rangoDeSemana(lunes: string): string {
  const domingo = sumarDias(lunes, 6);
  const mesA = MES(lunes);
  const mesB = MES(domingo);
  return mesA === mesB
    ? `${DIA_DEL_MES(lunes)} – ${DIA_DEL_MES(domingo)} ${mesB}`
    : `${DIA_DEL_MES(lunes)} ${mesA} – ${DIA_DEL_MES(domingo)} ${mesB}`;
}

/** La inicial del día para la tira de la semana: L M M J V S D. */
export const INICIAL_DIA = ["L", "M", "M", "J", "V", "S", "D"] as const;

/** Los puntitos de carga de la tira: uno por clase, como mucho tres. */
export const puntitos = (n: number): number => Math.max(0, Math.min(3, Math.trunc(n)));

/**
 * Deslizar de costado cambia de semana (M-057): un gesto mayormente horizontal de al menos
 * `umbral` px. Hacia la izquierda, la siguiente; hacia la derecha, la anterior. Lo vertical es
 * scroll y no cuenta.
 */
export function direccionDeslizar(dx: number, dy: number, umbral = 60): "anterior" | "siguiente" | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < umbral || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  return dx < 0 ? "siguiente" : "anterior";
}

/**
 * Cuánto tapa el teclado del celular (M-069): lo que le falta al viewport visible para llegar al
 * de la página. Menos de 80 px son barras del navegador, no el teclado.
 */
export function altoTeclado(alturaVentana: number, alturaVisible: number, desplazamientoVisible = 0): number {
  const t = Math.round(alturaVentana - alturaVisible - Math.max(0, desplazamientoVisible));
  return Number.isFinite(t) && t >= 80 ? t : 0;
}

/** «1 clase», «4 clases». */
export const clases = (n: number): string => `${n} clase${n === 1 ? "" : "s"}`;

/** «vie 23/10» (la cabecera de Hoy). */
export function diaConMes(fecha: string): string {
  return `${diaCorto(fecha)}/${fecha.slice(5, 7)}`;
}

/** «jueves 23» (el título de cada día de la Semana). */
export function diaLargo(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00.000Z`);
  return `${d.toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" })} ${d.getUTCDate()}`;
}
