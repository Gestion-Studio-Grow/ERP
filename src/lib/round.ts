/**
 * Redondeo a 2 decimales (pesos) — regla ÚNICA del camino de dinero del POS.
 *
 * Antes había 4 definiciones IDÉNTICAS de `round2` copiadas en caja, order-core, purchase-core y
 * wa-intent (`Math.round(n * 100) / 100`). Acá se unifican en un solo lugar, con el MISMO
 * comportamiento (dedup sin cambio de conducta) — así el redondeo del POS/caja/compras tiene una
 * sola fuente de verdad. Ver docs/arquitectura BACKLOG M1.
 *
 * ⚠️ Inconsistencia conocida (R4, decisión pendiente): el camino FISCAL (`fiscal.ts`) usa una
 * variante EPSILON-safe `Math.round((n + Number.EPSILON) * 100) / 100`, que corrige la frontera
 * binaria de x.xx5 (p. ej. 1.005 → 1.01 en vez de 1.00). Unificar TODO en esa variante cambia el
 * redondeo del POS al medio centavo — es un cambio de comportamiento de dinero que NO se decide en
 * un refactor de dedup: se eleva al PMO/ADR (ver docs/arquitectura). Hasta entonces, esta función
 * conserva el comportamiento histórico del POS.
 *
 * Nota: `round3` (cantidades en kg del ledger de stock) vive en `stock/ledger.ts` — no es dinero y
 * no estaba duplicado, por eso no se toca acá.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
