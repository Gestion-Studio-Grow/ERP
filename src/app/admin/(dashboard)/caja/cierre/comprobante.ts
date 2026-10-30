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
//
// Si la fila trae `porColumna`, el comprobante es ESA hoja: lo que se tipeó por columna contra lo
// que la columna esperaba (`arqueoDeLaFila`). `porMedio` es el libro: con F2 no es lo que se contó.

import { CASH_METHODS } from "@/lib/caja/libro-caja";
import { arqueoDeLaFila } from "@/lib/caja/cierre-resumen";
import { TEXTO_NETO_NEGATIVO } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";

export type MedioDelComprobante = {
  medio: CashMethod;
  /** Cómo se llama en el comprobante: la columna de la hoja nueva o el medio del libro. */
  etiqueta: string;
  esperado: number;
  /** null = ese medio no se concilió. */
  declarado: number | null;
  diferencia: number | null;
  /** Transferencia con un neto negativo (cert. M1 v9 O2): qué quiere decir el signo. */
  neto: string | null;
};

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function mediosDelComprobante(changes: unknown): MedioDelComprobante[] | null {
  const arqueo = arqueoDeLaFila(changes);
  if (!arqueo) return null;
  const out: MedioDelComprobante[] = [];
  for (const medio of CASH_METHODS) {
    const m = arqueo.fuente[medio];
    if (typeof m !== "object" || m === null) continue;
    const { esperado, declarado, diferencia } = m as Record<string, unknown>;
    if (!esNumero(esperado)) continue;
    const dec = esNumero(declarado) ? declarado : null;
    out.push({
      medio,
      etiqueta: arqueo.etiquetas[medio],
      esperado,
      declarado: dec,
      diferencia: dec === null ? null : esNumero(diferencia) ? diferencia : Math.round((dec - esperado) * 100) / 100,
      neto: medio === "TRANSFERENCIA" && (esperado < 0 || (dec ?? 0) < 0) ? `Es un ${TEXTO_NETO_NEGATIVO}.` : null,
    });
  }
  return out.length > 0 ? out : null;
}

/** La diferencia del día: la suma de los medios conciliados (los sin conciliar no suman). */
export function diferenciaDelComprobante(medios: readonly MedioDelComprobante[]): number {
  return Math.round(medios.reduce((s, m) => s + (m.diferencia ?? 0), 0) * 100) / 100;
}
