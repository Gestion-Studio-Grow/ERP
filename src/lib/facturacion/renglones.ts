/**
 * Motor de facturación · pedido 4 de la consola del contador: comprobantes SIN productos (un abono,
 * un honorario) con el IVA DECLARADO por renglón, para que un Responsable Inscripto pueda emitir.
 *
 * El plugin no deja emitir A/B con el IVA como tasa pareja sobre el total (ENG-024): exige
 * `ivaPorProducto: true`, que hasta acá sólo ponían las ventas con productos. Una regla de abono
 * puede declarar su alícuota; este helper arma los montos con la MISMA cuenta que una venta
 * (`calcularImpuestosPorAlicuota`, ADR-100: al centavo, sin decimales sueltos) y devuelve lo que
 * va en `CreateInvoiceInput` (neto, iva, total, ivaPorProducto). PURO.
 *
 * Uso: `const m = montosDeRenglones("RESPONSABLE_INSCRIPTO", [{ total: 121000, alicuotaIva: 5 }]);`
 *      `if (m.ok) createInvoiceInTx(tx, { ...resto, neto: m.neto, iva: m.iva, total: m.total, ivaPorProducto: m.ivaPorProducto })`
 */

import { calcularImpuestosPorAlicuota, type RenglonConAlicuota } from "@/lib/fiscal/impuestos-por-alicuota";
import type { SubtotalIva } from "@/lib/invoice-core";
import type { CondicionIva } from "@/lib/fiscal";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";

export type MontosDeRenglones =
  | { ok: true; neto: number; iva: SubtotalIva[]; total: number; ivaPorProducto: boolean }
  | { ok: false; error: string };

/** Montos de un comprobante armado por renglones con su alícuota (IVA incluido en cada `total`). */
export function montosDeRenglones(
  condicionIvaEmisor: CondicionIva,
  renglones: readonly RenglonConAlicuota[],
): MontosDeRenglones {
  if (renglones.length === 0) return { ok: false, error: "El comprobante no tiene renglones." };
  const total = sumarAlCentavo(renglones.map((r) => Number(r.total)));
  const r = calcularImpuestosPorAlicuota(condicionIvaEmisor, { total, renglones });
  if (!r.ok) return { ok: false, error: r.motivo };
  return { ok: true, ...r.impuestos, ivaPorProducto: r.ivaPorProducto };
}
