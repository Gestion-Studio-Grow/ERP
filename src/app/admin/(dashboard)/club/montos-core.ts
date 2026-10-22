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

/** Lo que dice el «Paga con» del efectivo, ya calculado contra el total. */
export type Vuelto =
  /** No tipeó nada: se cobra justo. */
  | { estado: "vacio" }
  /** Lo tipeado no es un monto. */
  | { estado: "invalido" }
  /** Con eso no alcanza. */
  | { estado: "falta"; falta: number }
  | { estado: "ok"; vuelto: number };

/**
 * El vuelto del mostrador: «paga con 10.000» sobre $ 3.800 → vuelto $ 6.200. Lee el monto con la misma regla que todo el
 * club (`leerMonto`). Es sólo pantalla: a la caja entra el TOTAL de la venta, nunca lo que dio el cliente.
 */
export function vueltoDe(total: number, pagaCon: string): Vuelto {
  if (pagaCon.trim() === "") return { estado: "vacio" };
  const da = leerMonto(pagaCon);
  if (!Number.isFinite(da) || da <= 0) return { estado: "invalido" };
  if (da < total) return { estado: "falta", falta: total - da };
  return { estado: "ok", vuelto: da - total };
}
