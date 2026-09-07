// Marca de los movimientos de AJUSTE que produce un cierre diario.
//
// Vive en su propio archivo (y no en `cierre-diario.ts`) para no arrastrar nada a la
// aritmética pura, y para que `frontera-cierre.ts` pueda importarla sin ciclos.
//
// La marca va en `createdBy` —mismo patrón que el corte inicial y que el importador del
// histórico— y sirve para dos cosas: saber de qué cierre salió una fila del libro, y
// poder deshacer un cierre borrando por marca si alguna vez hiciera falta. NO es la
// frontera de congelamiento: un cierre que cuadra no produce ajustes y aun así congela
// el día (ver `frontera-cierre.ts`).

import type { DayKey } from "@/lib/caja/cierre-diario";

export const CIERRE_DIARIO_ACTOR_PREFIX = "cierre-diario:";

export function cierreMarker(day: DayKey): string {
  return `${CIERRE_DIARIO_ACTOR_PREFIX}${day}`;
}

/** ¿Esta fila del libro es el ajuste de un cierre? Se usa para no dejar borrarla. */
export function esAjusteDeCierre(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(CIERRE_DIARIO_ACTOR_PREFIX);
}
