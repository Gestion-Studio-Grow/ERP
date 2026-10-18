// Qué horas muestra la grilla de escritorio del calendario. PURO.
//
// Era fija de 9 a 19 h: un turno de las 8 o de las 20 (una clienta que entra antes de abrir, una
// sesión después de hora) no aparecía en la grilla de escritorio aunque existiera, y la recepción lo
// daba por libre (UAT de CH, 18/10). Ahora la grilla se estira hasta cubrir todos los turnos del día;
// sin turnos raros, sigue siendo de 9 a 19 como siempre.

export const HORA_DESDE = 9;
export const HORA_HASTA = 19;

/** Minutos desde la medianoche (hora de pared del negocio) de cada turno: inicio y fin. */
export interface TurnoEnMinutos {
  desde: number;
  hasta: number;
}

export function horasDeLaGrilla(turnos: readonly TurnoEnMinutos[]): { desde: number; hasta: number } {
  let desde = HORA_DESDE;
  let hasta = HORA_HASTA;
  for (const t of turnos) {
    desde = Math.min(desde, Math.floor(t.desde / 60));
    // Un turno que termina pasada la medianoche se corta a las 24 (la grilla es de un día).
    const fin = t.hasta < t.desde ? 24 * 60 : t.hasta;
    hasta = Math.max(hasta, Math.ceil(fin / 60));
  }
  return { desde: Math.max(0, desde), hasta: Math.min(24, hasta) };
}
