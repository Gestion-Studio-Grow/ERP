/**
 * Motor de facturación · NOTA DE CRÉDITO — las cuentas (núcleo PURO).
 *
 * Una nota de crédito anula una factura AUTORIZADA, entera o en parte. Las reglas fiscales (misma
 * letra, mismo receptor, que no supere lo que queda por anular, fechas) las decide
 * `decidirComprobante` (src/lib/fiscal/decidir-comprobante.ts); acá sólo:
 *
 *   · `saldoPorAnular`: lo que queda de la factura después de las notas ya emitidas.
 *   · `montosDeLaNota`: el neto y el IVA de una nota PARCIAL, repartidos en proporción al
 *     importe, al centavo, y cerrando EXACTO: neto + IVA = importe de la nota, y la base de cada
 *     alícuota suma el neto (lo que ARCA controla en ImpNeto / BaseImp). La nota total copia los
 *     montos de la factura tal cual.
 *
 * Todo en centavos enteros (ADR-100): nunca se suman decimales flotantes.
 */

import type { SubtotalIva } from "@/lib/invoice-core";

const aCentavos = (n: number) => Math.round(Number(Number(n).toFixed(2)) * 100);
const aPesos = (c: number) => c / 100;

export interface MontosDelComprobante {
  neto: number;
  iva: SubtotalIva[];
  total: number;
}

/** Lo que queda por anular de una factura: su total menos las notas de crédito vivas. */
export function saldoPorAnular(totalFactura: number, yaAcreditado: number): number {
  return aPesos(Math.max(0, aCentavos(totalFactura) - aCentavos(yaAcreditado)));
}

/**
 * Los montos de una nota de crédito por `importe` sobre la factura `original`. Lanza si el importe
 * no es positivo o supera el total de la factura (el saldo lo controla quien llama, con la
 * decisión fiscal).
 */
export function montosDeLaNota(original: MontosDelComprobante, importe: number): MontosDelComprobante {
  const T = aCentavos(original.total);
  const I = aCentavos(importe);
  if (!Number.isFinite(I) || I <= 0) throw new Error("El importe de la nota de crédito tiene que ser mayor a cero.");
  if (I > T) throw new Error("La nota de crédito no puede ser mayor que la factura.");
  if (I === T) {
    return { neto: original.neto, iva: original.iva.map((r) => ({ ...r })), total: original.total };
  }
  if (original.iva.length === 0) return { neto: aPesos(I), iva: [], total: aPesos(I) };

  const f = I / T;
  const importes = original.iva.map((r) => Math.round(aCentavos(r.importe) * f));
  const netoC = I - importes.reduce((a, b) => a + b, 0);
  let bases: number[];
  if (original.iva.length === 1) {
    bases = [netoC];
  } else {
    bases = original.iva.map((r) => Math.round(aCentavos(r.base) * f));
    // El residuo del redondeo va a la base más grande: las bases suman EXACTO el neto.
    const residuo = netoC - bases.reduce((a, b) => a + b, 0);
    let mayor = 0;
    bases.forEach((b, i) => {
      if (b > bases[mayor]) mayor = i;
    });
    bases[mayor] += residuo;
  }
  return {
    neto: aPesos(netoC),
    iva: original.iva.map((r, i) => ({ alicuotaId: r.alicuotaId, base: aPesos(bases[i]), importe: aPesos(importes[i]) })),
    total: aPesos(I),
  };
}
