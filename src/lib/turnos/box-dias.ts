// ============================================================================
// BOX QUE ABRE SÓLO ALGUNOS DÍAS (box «Nail Artist», docs/tenants/ch/NAIL-ARTIST.md §2). PURO.
// ============================================================================
//
// CH le da a la manicura el box y su agenda, y lo abre para uñas SÓLO los días que ella va (varía
// semana a semana). Un box con `soloDiasAbiertos` ofrece horarios únicamente en las fechas abiertas
// (fecha de pared en la zona del negocio), y siempre dentro de los `WorkingHours` de la profesional:
// esta regla RESTA días, nunca agrega horas.
//
// `regla === null` = el box no restringe (interruptor `nail-artist` apagado, casilla sin marcar o
// migración sin aplicar): todo como hoy.

export type ReglaDelBox = { soloDiasAbiertos: boolean; abiertos: ReadonlySet<string> } | null;

export const RECHAZO_BOX_CERRADO = "El box de uñas no abre ese día. Elegí otro día.";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿El box ofrece turnos en esa fecha (YYYY-MM-DD, zona del negocio)? */
export function boxAbreEseDia(regla: ReglaDelBox, fecha: string): boolean {
  if (!regla || !regla.soloDiasAbiertos) return true;
  return regla.abiertos.has(fecha);
}

/** Las fechas pedidas en las que el box abre (mismo orden). */
export function fechasQueAbre(regla: ReglaDelBox, fechas: readonly string[]): string[] {
  return fechas.filter((f) => boxAbreEseDia(regla, f));
}

/** Fecha de pared → valor de la columna `@db.Date` (medianoche UTC de ese día). */
export function fechaComoDate(fecha: string): Date {
  if (!FECHA.test(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** Columna `@db.Date` → fecha de pared (YYYY-MM-DD). */
export function dateComoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function esFechaValida(fecha: string): boolean {
  if (!FECHA.test(fecha)) return false;
  return dateComoFecha(fechaComoDate(fecha)) === fecha;
}

/** Mes (YYYY-MM) válido. */
export function esMesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** Primer y último día del mes (YYYY-MM-DD). */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** Mes siguiente/anterior (YYYY-MM). */
export function correrMes(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Grilla del calendario del mes, semanas de lunes a domingo; `null` = celda vacía antes del 1 o
 * después del último día.
 */
export function grillaDelMes(mes: string): (string | null)[][] {
  const { hasta } = rangoDelMes(mes);
  const ultimo = Number(hasta.slice(8));
  const [y, m] = mes.split("-").map(Number);
  const dowDel1 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = domingo
  const huecos = (dowDel1 + 6) % 7; // lunes primero
  const celdas: (string | null)[] = new Array<string | null>(huecos).fill(null);
  for (let d = 1; d <= ultimo; d++) celdas.push(`${mes}-${String(d).padStart(2, "0")}`);
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}
