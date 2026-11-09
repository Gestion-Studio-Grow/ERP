// ============================================================================
// TALLER DE STANDS — horas y mano de obra (GSG-MIA-004 · T3). Núcleo puro: sin base ni Next, se prueba solo.
// Decisión del dueño (09/11): el valor hora es POR PERSONA (`ProyectoPersona`), con vigencia por fecha.
// ============================================================================

import { redondear } from "@/lib/proyectos/core";

export const MAX_HORAS_POR_CARGA = 24;

export interface ValorHora {
  valorHora: number;
  vigenteDesde: Date;
}

const dia = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * El valor hora vigente de una persona en una fecha: el de `vigenteDesde` más reciente que no sea posterior a esa
 * fecha (se compara por día, en UTC). Sin ninguno vigente → null (no se inventa un valor).
 */
export function valorHoraVigente(valores: readonly ValorHora[], fecha: Date): number | null {
  if (Number.isNaN(fecha.getTime())) return null;
  const tope = dia(fecha);
  let mejor: ValorHora | null = null;
  for (const v of valores) {
    if (Number.isNaN(v.vigenteDesde.getTime()) || dia(v.vigenteDesde) > tope) continue;
    if (!mejor || v.vigenteDesde.getTime() > mejor.vigenteDesde.getTime()) mejor = v;
  }
  return mejor ? mejor.valorHora : null;
}

/** «AAAA-MM-DD» del formulario → fecha a medianoche UTC. Cualquier otra cosa → null. */
export function leerFecha(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

// ── Validaciones ───────────────────────────────────────────────────────────

export function validarHoras(horas: number): { ok: true; horas: number } | { ok: false; error: string } {
  if (!Number.isFinite(horas)) return { ok: false, error: "Poné las horas con un número." };
  // Se valida lo que se GUARDA (redondeado): «0,001» redondea a 0 y la base lo rechazaría con un 500.
  horas = redondear(horas);
  if (horas <= 0) return { ok: false, error: "Las horas tienen que ser más que cero." };
  if (horas > MAX_HORAS_POR_CARGA) return { ok: false, error: `No se pueden cargar más de ${MAX_HORAS_POR_CARGA} horas en una carga.` };
  return { ok: true, horas };
}

export function validarValorHora(valor: number): { ok: true; valor: number } | { ok: false; error: string } {
  if (!Number.isFinite(valor)) return { ok: false, error: "Poné el valor hora con un número." };
  valor = redondear(valor);
  if (valor <= 0) return { ok: false, error: "El valor hora tiene que ser mayor que cero." };
  return { ok: true, valor };
}

/**
 * Filtro de negocio: la persona elegida tiene que estar entre las del negocio (ya leídas con su `tenantId`). Es la
 * primera barrera; la segunda es la FK compuesta (personaId, tenantId) de la base.
 */
export function personaDelNegocio(personaId: string, personasDelNegocio: readonly { id: string }[]): boolean {
  return !!personaId && personasDelNegocio.some((p) => p.id === personaId);
}

// ── Costos ─────────────────────────────────────────────────────────────────

export interface CargaHoras {
  horas: number;
  valorHoraSnap: number;
}

/** Costo real de mano de obra: suma de horas × valor hora congelado en cada carga. */
export function costoManoObraReal(cargas: readonly CargaHoras[]): number {
  return redondear(cargas.reduce((s, c) => s + redondear(c.horas * c.valorHoraSnap), 0));
}

export const horasReales = (cargas: readonly Pick<CargaHoras, "horas">[]): number => redondear(cargas.reduce((s, c) => s + c.horas, 0));

/** Horas estándar del despiece: horas estándar de cada pieza × cantidad. */
export function horasTeoricas(lineas: readonly { cantidad: number; horasStd: number }[]): number {
  return redondear(lineas.reduce((s, l) => s + l.cantidad * l.horasStd, 0));
}

/**
 * Valor hora de referencia para el teórico: el promedio simple de los valores vigentes de las personas.
 * PROVISIONAL A CONFIRMAR por el dueño (podría ser ponderado por horas o el de una categoría). Sin valores → null.
 */
export function valorHoraReferencia(vigentes: readonly (number | null)[]): number | null {
  const v = vigentes.filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
  return v.length === 0 ? null : redondear(v.reduce((s, x) => s + x, 0) / v.length);
}

/** Costo teórico: horas estándar del despiece × valor hora de referencia. Sin referencia → null. */
export function costoManoObraTeorico(horasStd: number, referencia: number | null): number | null {
  return referencia == null ? null : redondear(horasStd * referencia);
}

export interface Desvio {
  monto: number; // real − teórico: positivo = se gastó más de lo previsto
  pct: number | null; // sobre el teórico; null si el teórico es cero
}

export function desvio(teorico: number, real: number): Desvio {
  const monto = redondear(real - teorico);
  return { monto, pct: teorico > 0 ? Math.round((monto / teorico) * 1000) / 10 : null };
}
