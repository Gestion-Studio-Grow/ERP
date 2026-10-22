// Lo puro del turnero (y de «Cambiar horario»): qué día y hora arrancan elegidos, qué dice el
// botón de abajo, cuánto sale, y sacar de la cinta la hora que se ocupó recién (A·E26).
// Sin React, sin red, sin la librería de reglas (core.ts arrastra la agenda entera): esto viaja al
// teléfono del alumno, así que va liviano. La hora se muestra SIEMPRE en la del negocio.

import type { DiaConLugar } from "@/lib/padel/datos.server";

const ZONA = "America/Argentina/Buenos_Aires";

/** "18:00" en la hora del negocio. */
export const horaCorta = (iso: string): string =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });

/** "vie 24/10 19:00" (para sugerir una hora de otro día). */
export function diaYHora(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: ZONA }).replace(".", "");
  const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: ZONA });
  return `${dia} ${fecha} ${horaCorta(iso)}`;
}

/** "$ 25.000": pesos sin centavos (el dominio no los usa). */
export const plata = (n: number): string => `$ ${Math.round(n).toLocaleString("es-AR")}`;

export type TipoTurnero = "INDIVIDUAL" | "GRUPAL";

/** Lo que sale la clase elegida, total. */
export const precioElegido = (tipo: TipoTurnero, personas: number, individual: number, grupalPorPersona: number): number =>
  tipo === "GRUPAL" ? grupalPorPersona * Math.min(4, Math.max(2, Math.trunc(personas) || 2)) : individual;

/**
 * El precio a la vista ANTES de elegir la hora (M-096): «$ 25.000», o con amigos «$ 12.000 c/u ·
 * total $ 36.000». null si el profe no cargó precio (no se muestra un «$ 0»).
 */
export function textoPrecio(tipo: TipoTurnero, personas: number, individual: number, grupalPorPersona: number): string | null {
  if (tipo === "GRUPAL") {
    if (!(grupalPorPersona > 0)) return null;
    return `${plata(grupalPorPersona)} c/u · total ${plata(precioElegido(tipo, personas, individual, grupalPorPersona))}`;
  }
  return individual > 0 ? plata(individual) : null;
}

/** El botón fijo de abajo: «Pedir jue 24 · 18:00 · $ 25.000», o qué falta elegir. */
export function textoCta(p: { etiquetaDia: string | null; hora: string | null; precio: number }): string {
  if (!p.etiquetaDia || !p.hora) return "Elegí día y hora";
  const dia = /^(hoy|mañana)$/i.test(p.etiquetaDia) ? p.etiquetaDia.toLowerCase() : p.etiquetaDia;
  return `Pedir ${dia} · ${horaCorta(p.hora)}${p.precio > 0 ? ` · ${plata(p.precio)}` : ""}`;
}

/**
 * Con qué día (y hora) arranca la cinta. `?hora=<ISO>` (el «¿Te sirve…?» del profe, M-043) elige
 * día y hora si sigue libre; `?fecha=YYYY-MM-DD` («Elegir otro horario», M-100) elige ese día si
 * tiene lugar. Si no, el primer día con lugar.
 */
export function inicioDeLaCinta(dias: readonly DiaConLugar[], pedido: { fecha?: string | null; hora?: string | null }): { fecha: string; hora: string | null } {
  if (pedido.hora) {
    const t = new Date(pedido.hora).getTime();
    if (!Number.isNaN(t)) {
      const iso = new Date(t).toISOString();
      const dia = dias.find((d) => d.horas.includes(iso));
      if (dia) return { fecha: dia.fecha, hora: iso };
    }
  }
  if (pedido.fecha && dias.some((d) => d.fecha === pedido.fecha)) return { fecha: pedido.fecha, hora: null };
  return { fecha: dias[0]?.fecha ?? "", hora: null };
}

/** La cinta sin esa hora (se ocupó recién): el chip se apaga y, si el día queda vacío, se va. */
export function sinLaHora(dias: readonly DiaConLugar[], iso: string): DiaConLugar[] {
  return dias.map((d) => ({ ...d, horas: d.horas.filter((h) => h !== iso) })).filter((d) => d.horas.length > 0);
}

/** Las alternativas que mandó el servidor, sólo las que siguen en la cinta (a lo sumo 2, M-097). */
export function alternativasEnCinta(dias: readonly DiaConLugar[], alternativas: readonly string[] | undefined, n = 2): string[] {
  const libres = new Set(dias.flatMap((d) => d.horas));
  return (alternativas ?? []).filter((a) => libres.has(a)).slice(0, n);
}

/** Lo que este teléfono recuerda del alumno (nombre y celular, para no tipear de nuevo). Nunca el link. */
export const RECUERDO = "gsg-padel-alumno";

export function leerRecuerdo(raw: string | null | undefined): { nombre: string; telefono: string } | null {
  try {
    const r = JSON.parse(raw ?? "") as { nombre?: unknown; telefono?: unknown };
    const nombre = typeof r?.nombre === "string" ? r.nombre.trim().slice(0, 80) : "";
    const telefono = typeof r?.telefono === "string" ? r.telefono.trim().slice(0, 30) : "";
    return nombre && telefono ? { nombre, telefono } : null;
  } catch {
    return null;
  }
}

/**
 * Lo que ve el alumno si la acción del servidor TIRA en vez de contestar. Nunca el error boundary.
 * Un choque con otro alumno NO llega acá: el servidor lo contesta como «Se ocupó recién» (también
 * cuando agotó los reintentos, `respuestaDeError` en acciones-compartido.ts). Lo que tira es un corte
 * de señal, la base caída o un error nuestro: no se sabe si llegó, y se dice así (O-16 de la CERT).
 */
export const SIN_CONEXION_PEDIDO = "No pudimos tomar tu pedido: puede que se haya cortado la señal o que algo falló de nuestro lado. Probá de nuevo en un ratito.";
export const SIN_CONEXION_CAMBIO = "No pudimos hacer el cambio: puede que se haya cortado la señal o que algo falló de nuestro lado. Mirá tus clases para ver cómo quedó y probá de nuevo.";

/** Las `n` horas libres de la cinta más cercanas a `iso` (sin contarla): para «Se ocupó recién». */
export function cercanas(dias: readonly DiaConLugar[], iso: string, n = 2): string[] {
  const t = new Date(iso).getTime();
  return dias
    .flatMap((d) => d.horas)
    .filter((h) => h !== iso)
    .sort((a, b) => Math.abs(new Date(a).getTime() - t) - Math.abs(new Date(b).getTime() - t) || a.localeCompare(b))
    .slice(0, n)
    .sort();
}
