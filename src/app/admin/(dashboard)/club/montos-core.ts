// ============================================================================
// LEER UN MONTO — lo que se tipea en el mostrador, igual en todas las pantallas del club. PURO.
// ============================================================================
//
// Una sola regla para la caja (egreso, cierre, fondo), el tablero, «Cobrar una parte» de la cancha y el cargo manual
// del buffet (hallazgo B2 del Gate: «$ 12.500» andaba en la caja y no en la cuenta). Es la de caja-core.ts, sin
// cambios: el punto separa miles, la coma es la de los decimales y se redondea al peso.

/** El monto que tipea la persona: «12.500», «12500», «$ 12.500» → 12500; «12.500,50» → 12501. Vacío o inválido → NaN. */
export function leerMonto(texto: string): number {
  const limpio = texto.replace(/[$\s.]/g, "").replace(",", ".");
  return limpio === "" ? Number.NaN : Math.round(Number(limpio));
}
