/**
 * FACTURITA · Montos del comprobante (neto, IVA, total), según quién emite. PURO.
 *
 * - Monotributo / exento (Factura C): la cuenta de siempre (`calcularImpuestos`): sin IVA
 *   discriminado.
 * - Responsable Inscripto (A o B): el IVA DECLARADO en un renglón con la alícuota elegida
 *   (`montosDeRenglones`, el mismo helper del motor que usa la consola), que marca
 *   `ivaPorProducto: true`. Sin eso el plugin frena toda factura del inscripto (ENG-024,
 *   src/plugins/arca/domain/iva-por-producto.ts).
 *
 * No se reimplementa ninguna cuenta fiscal: se elige cuál del motor corresponde.
 */

import { calcularImpuestos } from "@/lib/fiscal/impuestos-por-alicuota";
import { montosDeRenglones } from "@/lib/facturacion/renglones";
import type { CondicionIva } from "@/lib/fiscal";
import type { SubtotalIva } from "@/lib/invoice-core";

export type MontosFacturita =
  | { ok: true; neto: number; iva: SubtotalIva[]; total: number; ivaPorProducto: boolean }
  | { ok: false; error: string };

export function montosFacturita(condicionEmisor: CondicionIva, total: number, alicuotaId: number): MontosFacturita {
  if (condicionEmisor === "RESPONSABLE_INSCRIPTO") {
    return montosDeRenglones(condicionEmisor, [{ total, alicuotaIva: alicuotaId }]);
  }
  const m = calcularImpuestos(condicionEmisor, total);
  return { ok: true, ...m, ivaPorProducto: false };
}
