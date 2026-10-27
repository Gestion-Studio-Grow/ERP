// El resumen al pie de Agendar y lo que dice el botón (matias-DISENO.md §2.3 · M-053/M-055).
// «Juan · jue 24 · 19:00 · $ 25.000». Puro: lo prueba resumen.test.ts.

import { diaCorto, sumarDias } from "@/lib/padel/core";
import { plataTexto } from "../_plata";
import { primerNombre } from "../_cola";

export type DatosResumen = {
  /** El nombre del alumno elegido (o el del nuevo que se está cargando). */
  alumno?: string | null;
  /** "YYYY-MM-DD". */
  fecha?: string | null;
  /** "HH:MM". */
  hora?: string | null;
  tipo: "INDIVIDUAL" | "GRUPAL";
  personas: number;
  precio: number;
  /** "YYYY-MM-DD" de hoy, para decir «Hoy» y «Mañana». */
  hoy: string;
};

export function etiquetaDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  return diaCorto(fecha);
}

/** Lo que se va a agendar, con lo que ya está elegido. Vacío si no se eligió nada. */
export function textoResumen(d: DatosResumen): string {
  const partes: string[] = [];
  const nombre = d.alumno?.trim();
  if (nombre) partes.push(primerNombre(nombre));
  if (d.fecha) partes.push(etiquetaDia(d.fecha, d.hoy));
  if (d.hora) partes.push(d.hora);
  if (!partes.length) return "";
  if (d.tipo === "GRUPAL") partes.push(`Con amigos (${d.personas})`);
  if (d.precio > 0) partes.push(plataTexto(d.precio));
  return partes.join(" · ");
}

/**
 * El botón de «Agendar y avisar»: deshabilitado hasta tener alumno, día y hora; mientras tanto dice
 * qué falta (B1/M-053: arranca diciendo «Elegí el alumno», nunca con uno elegido).
 */
export function botonAgendar(p: { alumno: boolean; hora: boolean; pendiente: boolean }): { disabled: boolean; texto: string } {
  if (p.pendiente) return { disabled: true, texto: "Agendando…" };
  if (!p.alumno) return { disabled: true, texto: "Elegí el alumno" };
  if (!p.hora) return { disabled: true, texto: "Elegí la hora" };
  return { disabled: false, texto: "Agendar y avisar" };
}
