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

// ── Diferencia del ARQUEO DE TURNO ──────────────────────────────────────────
//
// Otra marca, otro hecho. El cierre DIARIO arquea los tres medios y congela el día; el
// arqueo de TURNO cuenta el cajón de un relevo de mostrador y no congela nada.
//
// Existe porque hasta ahora la diferencia del turno se guardaba SÓLO en
// `CashSession.closingDiff` y no la leía ningún libro: el saldo del libro se deriva sumando
// movimientos, así que un faltante contado en el cajón se evaporaba. Era el defecto de la
// planilla —el faltante anotado al margen que no llega a ningún lado— con otra ropa.
//
// Con el ajuste asentado, el cierre del día ya ve el cajón conciliado: si nada más pasó, su
// diferencia en EFECTIVO da cero. Turno y día dejan de ser dos verdades.
export const ARQUEO_TURNO_ACTOR_PREFIX = "arqueo-turno:";

export function arqueoTurnoMarker(sessionId: string): string {
  return `${ARQUEO_TURNO_ACTOR_PREFIX}${sessionId}`;
}

/**
 * El ajuste que deja el arqueo de un turno, como fila del libro. PURO.
 *
 * Vive acá y no dentro de la server action para poder testear el signo sin base: el signo es
 * lo único que puede estar mal y lo que más caro sale. El conteo físico manda —contado por
 * encima del esperado es plata que el sistema no tenía (INGRESO); por debajo, falta (EGRESO)—
 * y siempre en EFECTIVO, porque el arqueo de turno cuenta el cajón y nada más.
 *
 * `null` cuando cuadra: un arqueo sin diferencia no escribe nada.
 */
export function ajusteDeArqueoTurno(
  diff: number,
  sessionId: string,
): { type: "INGRESO" | "EGRESO"; method: "EFECTIVO"; amount: number; reason: string; createdBy: string } | null {
  if (!Number.isFinite(diff) || diff === 0) return null;
  const sobra = diff > 0;
  return {
    type: sobra ? "INGRESO" : "EGRESO",
    method: "EFECTIVO",
    amount: Math.abs(diff),
    reason: sobra ? "Sobrante del arqueo de turno" : "Faltante del arqueo de turno",
    createdBy: arqueoTurnoMarker(sessionId),
  };
}
