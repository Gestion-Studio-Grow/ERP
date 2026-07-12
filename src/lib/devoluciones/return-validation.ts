// ============================================================================
// DEVOLUCIÓN a proveedor (D4) — validación de líneas. PURO.
// ============================================================================
//
// Una devolución no puede sacar más de lo que se compró en esa entrada. Esta es la regla
// dura de las líneas (misma idea que `validateNewCollection` para el dinero): la corre el
// form en cliente para feedback inmediato y el servicio de S1 en el server (autoridad).
// Sin schema ni Prisma acá.

import { round2 } from "@/lib/round";

export type ReturnLineError = "QTY_NOT_FINITE" | "QTY_NOT_POSITIVE" | "EXCEEDS_PURCHASED";

export type ReturnLineValidation =
  | { ok: true; qty: number }
  | { ok: false; error: ReturnLineError };

/**
 * Valida una cantidad a devolver contra lo comprado en la línea. PURA.
 * - no finita → error; ≤ 0 → error; mayor a lo comprado → error.
 * Devuelve la cantidad redondeada a 2 (kg/unidades) lista para persistir.
 */
export function validateReturnLine(qty: number, purchased: number): ReturnLineValidation {
  if (!Number.isFinite(qty)) return { ok: false, error: "QTY_NOT_FINITE" };
  const q = round2(qty);
  if (q <= 0) return { ok: false, error: "QTY_NOT_POSITIVE" };
  if (q > round2(purchased)) return { ok: false, error: "EXCEEDS_PURCHASED" };
  return { ok: true, qty: q };
}

/** ¿Hay al menos una línea con cantidad válida (> 0 y ≤ comprada)? Para habilitar el submit. PURA. */
export function hasValidReturnLine(
  lines: readonly { qty: number; purchased: number }[],
): boolean {
  return lines.some((l) => validateReturnLine(l.qty, l.purchased).ok);
}

/**
 * A-4 — Tope REAL de lo devolvible de una línea de compra: lo comprado MENOS lo ya devuelto
 * de esa misma compra+producto. PURA. Sin esto, el tope era siempre `comprado` y se podía
 * devolver de a poco hasta superar lo comprado (de 10 kg: 8 + 8 = 16). Clamp a 0 (nunca
 * negativo) y redondeo a 2 (kg/unidades). Es el `purchased` que se le pasa a
 * `validateReturnLine`, tanto en el loader (feedback) como en la acción (autoridad server).
 */
export function remainingReturnable(purchased: number, alreadyReturned: number): number {
  const rem = round2(round2(purchased) - round2(Math.max(0, alreadyReturned)));
  return rem > 0 ? rem : 0;
}
