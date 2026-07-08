/**
 * Redondeo a 2 decimales (pesos) — regla ÚNICA del camino de dinero de TODO el sistema
 * (POS/caja/compras + FISCAL). Fuente de verdad única del redondeo de plata.
 *
 * Antes había 4 copias idénticas de `round2` (caja, order-core, purchase-core, wa-intent) + una
 * variante distinta en `fiscal.ts` (`redondear`). Ambas se unificaron acá (dedup + R4 cerrado).
 *
 * ✅ R4 resuelto (ADR-057): esta es la variante EPSILON-safe
 * `Math.round((n + Number.EPSILON) * 100) / 100`, que corrige la frontera binaria de x.xx5
 * (p. ej. 1.005 → 1.01, 1.015 → 1.02, en vez de caer por debajo). Es el redondeo comercial/AFIP
 * "medio hacia arriba" y ahora rige también el POS (cambio de comportamiento en el medio centavo,
 * ASUMIDO a propósito: antes el POS y la factura redondeaban distinto). Ver
 * `docs/adr/ADR-057-representacion-de-dinero-decimal-vs-float-y-redondeo.md`.
 *
 * Nota: `round3` (cantidades en kg del ledger de stock) vive en `stock/ledger.ts` — no es dinero y
 * no se toca acá.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
