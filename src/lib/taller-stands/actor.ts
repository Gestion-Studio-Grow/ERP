// ============================================================================
// TALLER DE STANDS — marca del actor de la DEVOLUCIÓN de materiales (T6). PURO, sin imports: lo leen el costo vigente
// (stock/costo.ts, que importa un client component vía ledger.ts), el costo de lo vendido (reports) y el sugerido de
// compra (suppliers/sugerido.ts).
// La devolución es una REPOSICION con el costo al que se descontó (TallerConsumo.costoTotal / cantidad): NO es una
// compra (no pisa el «último ingreso con costo»), resta del costo de insumos del mes y resta demanda.
// ============================================================================

/** `createdBy` de la REPOSICION de «Devolver al stock»: `taller-devolucion:` + el actor ("user:<id>"). */
export const TALLER_DEVOLUCION_ACTOR_PREFIX = "taller-devolucion:";

/** ¿Este `createdBy` es una devolución de materiales del taller? PURA. */
export function esDevolucionDelTaller(createdBy: string | null | undefined): boolean {
  return typeof createdBy === "string" && createdBy.startsWith(TALLER_DEVOLUCION_ACTOR_PREFIX);
}
