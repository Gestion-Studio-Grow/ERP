// ============================================================================
// OBLIGACIONES A MANO (MIA-50 T09 · O07, M7b). PURO.
// Una obligación tiene tipo (parámetro `calendario.tiposObligacion`), responsable, vencimiento y días de aviso (por defecto,
// el parámetro `calendario.diasAviso`). El aviso sale una sola vez: el día `vence − días de aviso` o después, mientras no
// esté hecha. Los días se cuentan en hora de Argentina, como el calendario.
// ============================================================================

import { claveDia } from "./gestion-lecturas-core";

const DIA = 86_400_000;
export const MAX_TITULO = 160;
export const MAX_DIAS_AVISO = 60;

export interface DatosObligacion { tipo: string; titulo: string; responsableId: string; venceEl: Date; diasAviso: number; proyectoId: string | null }

/** Lee y valida lo que manda el formulario. Devuelve el motivo si algo no va. */
export function leerObligacion(
  campo: (nombre: string) => string,
  tipos: readonly string[],
  diasPorDefecto: number,
): DatosObligacion | string {
  const tipo = campo("tipo").trim();
  if (!tipos.includes(tipo)) return "Elegí un tipo de la lista.";
  const titulo = campo("titulo").trim().slice(0, MAX_TITULO);
  if (!titulo) return "Escribí qué hay que hacer.";
  const responsableId = campo("responsableId").trim();
  if (!responsableId) return "Elegí quién es responsable.";
  const vence = campo("venceEl").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) return "Poné la fecha de vencimiento.";
  const venceEl = new Date(`${vence}T12:00:00-03:00`);
  // «2026-02-30» no da fecha inválida: rueda al 2 de marzo. Se compara contra lo escrito.
  if (Number.isNaN(venceEl.getTime()) || claveDia(venceEl) !== vence) return "Esa fecha no existe.";
  const textoDias = campo("diasAviso").trim();
  const diasAviso = textoDias === "" ? diasPorDefecto : Number(textoDias);
  if (!Number.isInteger(diasAviso) || diasAviso < 0 || diasAviso > MAX_DIAS_AVISO) return `Los días de aviso van de 0 a ${MAX_DIAS_AVISO}.`;
  const proyectoId = campo("proyectoId").trim() || null;
  return { tipo, titulo, responsableId, venceEl, diasAviso, proyectoId };
}

/** El día (clave AAAA-MM-DD, Argentina) en que sale el aviso. */
/** La fecha escrita (AAAA-MM-DD) como mediodía de Argentina, o null si no existe (31/4, 30/2). */
export function fechaDelCampo(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) || claveDia(d) !== v ? null : d;
}

export const diaDeAviso = (venceEl: Date, diasAviso: number): string => claveDia(new Date(venceEl.getTime() - diasAviso * DIA));

/** Si hoy le toca el aviso: no avisada, no hecha, y ya llegó su día. */
export function tocaAvisar(o: { venceEl: Date; diasAviso: number; avisadaEl: Date | null; hechaEl: Date | null }, hoy: Date): boolean {
  return !o.avisadaEl && !o.hechaEl && claveDia(hoy) >= diaDeAviso(o.venceEl, o.diasAviso);
}

/** El texto del aviso. */
export function textoDeAviso(o: { tipo: string; titulo: string; venceEl: Date }, hoy: Date): string {
  const dias = Math.round((Date.parse(`${claveDia(o.venceEl)}T12:00:00-03:00`) - Date.parse(`${claveDia(hoy)}T12:00:00-03:00`)) / DIA);
  const cuando = dias > 1 ? `vence en ${dias} días` : dias === 1 ? "vence mañana" : dias === 0 ? "vence hoy" : `venció hace ${-dias} ${dias === -1 ? "día" : "días"}`;
  return `${o.tipo}: ${o.titulo} ${cuando}`;
}
