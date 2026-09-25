// ============================================================================
// CIERRE DEL DÍA — el comprobante de un día cerrado, leído con sus números. PURO.
// ============================================================================
//
// Al cerrar, `cerrarDia` deja en la auditoría (entidad CierreDiario) lo que se contó por medio:
// `porMedio.<MEDIO> = { esperado, declarado, diferencia }`. La pantalla de siempre lo muestra
// como frases (`resumenCierre`, caja/cierre-resumen.ts); el diseño nuevo lo muestra como la MISMA
// hoja de arqueo con la que se contó (medio · contó · debería haber · diferencia), la plata en su
// columna. Esto sólo LEE esa fila: tolera una fila rara devolviendo null (y la pantalla vuelve a
// las frases), nunca inventa un número.

import { CASH_METHODS } from "@/lib/caja/libro-caja";
import type { CashMethod } from "@/lib/caja/cash-register";

export type MedioDelComprobante = {
  medio: CashMethod;
  esperado: number;
  /** null = ese medio no se concilió. */
  declarado: number | null;
  diferencia: number | null;
};

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function mediosDelComprobante(changes: unknown): MedioDelComprobante[] | null {
  if (typeof changes !== "object" || changes === null) return null;
  const porMedio = (changes as Record<string, unknown>).porMedio;
  if (typeof porMedio !== "object" || porMedio === null) return null;
  const out: MedioDelComprobante[] = [];
  for (const medio of CASH_METHODS) {
    const m = (porMedio as Record<string, unknown>)[medio];
    if (typeof m !== "object" || m === null) continue;
    const { esperado, declarado, diferencia } = m as Record<string, unknown>;
    if (!esNumero(esperado)) continue;
    const dec = esNumero(declarado) ? declarado : null;
    out.push({
      medio,
      esperado,
      declarado: dec,
      diferencia: dec === null ? null : esNumero(diferencia) ? diferencia : Math.round((dec - esperado) * 100) / 100,
    });
  }
  return out.length > 0 ? out : null;
}

/** La diferencia del día: la suma de los medios conciliados (los sin conciliar no suman). */
export function diferenciaDelComprobante(medios: readonly MedioDelComprobante[]): number {
  return Math.round(medios.reduce((s, m) => s + (m.diferencia ?? 0), 0) * 100) / 100;
}
