/**
 * IMPUESTOS DE UNA VENTA (R1-F5): neto, IVA por alícuota y total que lleva la factura. PURO.
 *
 * El Core calcula los impuestos (ADR-006); el plugin ARCA sólo los verifica
 * (src/plugins/arca/domain/validacion.ts). Dos casos:
 *  - Monotributo o exento (Factura C): no discrimina IVA. Lo cobrado va entero como neto, con un
 *    renglón al 0 %. Es la regla de siempre (`calcularImpuestos`, movida acá sin cambios desde
 *    src/lib/fiscal.ts, que la sigue exportando): CH factura así.
 *  - Responsable Inscripto (A o B): el IVA sale de la alícuota de cada producto
 *    (`Product.alicuotaIva`, el código de ARCA). Los renglones se agrupan por alícuota; en cada
 *    grupo el neto es lo cobrado dividido por (1 + alícuota), redondeado al centavo, y el IVA es lo
 *    que falta hasta lo cobrado. Así neto + IVA = total exacto al centavo, en cada alícuota y en la
 *    factura, y el IVA de cada grupo queda a menos de un centavo de base × alícuota, que es lo que
 *    el plugin tolera.
 *
 * Lo que no se puede facturar bien no se factura: no se inventa una alícuota ni se reparte el IVA a
 * ojo. Un producto sin alícuota, uno exento o no gravado (van en campos de ARCA que la factura del
 * Core todavía no lleva: ImpOpEx e ImpTotConc) o renglones que no suman lo cobrado devuelven el
 * motivo, para mostrarlo tal cual.
 *
 * Sin Prisma ni nada de servidor: lo usa Ventas (`puedeFacturarVenta`, que alcanza un componente de
 * cliente) y lo usa la emisión, para que lo que Ventas promete sea lo que se emite. Redondea sólo
 * con src/lib/dinero.
 */

import type { CondicionIva } from "@/lib/fiscal";
import type { SubtotalIva } from "@/lib/invoice-core";
import {
  admiteCentavos,
  centavosDe,
  redondearAlCentavo as redondear,
  sumarAlCentavo,
} from "@/lib/dinero/redondeo";

export interface Impuestos {
  neto: number;
  iva: SubtotalIva[];
  total: number;
}

// Códigos de alícuota de ARCA (los de `Product.alicuotaIva`, prisma/schema.prisma:600-603).
const NO_GRAVADO = 1;
const EXENTO = 2;
const IVA_0 = 3; // 0%
const IVA_21 = 5; // 21%

/**
 * Por cuánto se divide lo cobrado (IVA incluido) para llegar al neto, por código de alícuota de
 * ARCA: 1 + la alícuota. Escrito como número y no como suma, para que el 21 % dé exactamente lo
 * mismo que `calcularImpuestos`. El test lo compara con la tabla del plugin (`PORCENTAJE_IVA`).
 */
export const DIVISOR_POR_ALICUOTA: Readonly<Record<number, number>> = {
  3: 1, // 0 %
  4: 1.105, // 10,5 %
  5: 1.21, // 21 %
  6: 1.27, // 27 %
  8: 1.05, // 5 %
  9: 1.025, // 2,5 %
};

/**
 * Calcula neto + IVA + total a partir del monto bruto que paga el cliente y la
 * condición del emisor. Simplificado a propósito (ADR-024 §2.e):
 *  - Monotributo / Exento (Factura C): no discrimina IVA → una línea al 0%,
 *    neto = total = monto.
 *  - Responsable Inscripto (Factura A/B): el monto es IVA-incluido al 21% →
 *    neto = monto / 1,21; IVA = monto − neto.
 * Para el inscripto, la factura de una venta usa `calcularImpuestosPorAlicuota`: con esta tasa
 * pareja el plugin no lo deja emitir (ENG-024, src/plugins/arca/domain/iva-por-producto.ts).
 */
export function calcularImpuestos(emisor: CondicionIva, montoBruto: number): Impuestos {
  if (emisor === "RESPONSABLE_INSCRIPTO") {
    const neto = redondear(montoBruto / 1.21);
    const importe = redondear(montoBruto - neto);
    return {
      neto,
      iva: [{ alicuotaId: IVA_21, base: neto, importe }],
      total: redondear(neto + importe),
    };
  }
  // Monotributo / Exento / (fallback): Factura C, sin IVA discriminado.
  const neto = redondear(montoBruto);
  return {
    neto,
    iva: [{ alicuotaId: IVA_0, base: neto, importe: 0 }],
    total: neto,
  };
}

/** Un renglón de la venta, con lo que pesa en el IVA. */
export interface RenglonConAlicuota {
  /** Lo que se cobra por el renglón, IVA incluido y con sus descuentos, en pesos. */
  total: number;
  /** Código de alícuota de ARCA del producto (`Product.alicuotaIva`). Vacío: sin cargar. */
  alicuotaIva?: number | null;
}

export type ImpuestosDeLaVenta =
  | {
      ok: true;
      impuestos: Impuestos;
      /** `true` si el IVA salió de la alícuota de cada producto (`CreateInvoiceInput.ivaPorProducto`). */
      ivaPorProducto: boolean;
    }
  | { ok: false; motivo: string };

/** Lo que se muestra cuando un inscripto vende algo sin la alícuota de IVA del producto. */
export const MOTIVO_INSCRIPTO_SIN_ALICUOTA =
  "Para un Responsable Inscripto la factura lleva el IVA de cada producto: cargá la alícuota de IVA de los productos de esta venta y reintentá.";

export const MOTIVO_EXENTO_O_NO_GRAVADO =
  "La venta tiene productos exentos o no gravados de IVA, y el sistema todavía no los factura: hacé esta factura desde la página de ARCA.";

export const MOTIVO_RENGLONES_NO_SUMAN =
  "Los productos de esta venta no suman lo cobrado (hay un descuento o un recargo sobre el total), y así no se puede calcular el IVA de cada producto. Aplicá el descuento en cada producto y reintentá.";

const MOTIVO_RENGLON_SIN_IMPORTE =
  "Un producto de esta venta no tiene un importe válido: revisalo antes de facturar.";

const MOTIVO_SIN_IMPORTE = "Una venta sin importe no se factura.";

/**
 * Neto, IVA y total de la factura de una venta. `venta.total` es lo cobrado; `venta.renglones`,
 * lo que se cobró por cada producto con su alícuota.
 *
 * Monotributo o exento: `calcularImpuestos(emisor, venta.total)`, sin mirar los renglones: sale
 * exactamente lo mismo que antes, e `ivaPorProducto` es `false` (una C no discrimina IVA).
 * Responsable Inscripto: el IVA por alícuota descripto arriba, con `ivaPorProducto: true`; o el
 * motivo por el que no se puede facturar.
 */
export function calcularImpuestosPorAlicuota(
  emisor: CondicionIva,
  venta: { total: number; renglones: readonly RenglonConAlicuota[] },
): ImpuestosDeLaVenta {
  if (emisor !== "RESPONSABLE_INSCRIPTO") {
    return { ok: true, impuestos: calcularImpuestos(emisor, venta.total), ivaPorProducto: false };
  }
  if (!admiteCentavos(venta.total) || centavosDe(venta.total) <= 0) {
    return { ok: false, motivo: MOTIVO_SIN_IMPORTE };
  }
  if (venta.renglones.length === 0) return { ok: false, motivo: MOTIVO_INSCRIPTO_SIN_ALICUOTA };

  const cobradoPorAlicuota = new Map<number, number[]>();
  for (const renglon of venta.renglones) {
    if (!admiteCentavos(renglon.total) || centavosDe(renglon.total) < 0) {
      return { ok: false, motivo: MOTIVO_RENGLON_SIN_IMPORTE };
    }
    const alicuota = renglon.alicuotaIva;
    if (alicuota == null) return { ok: false, motivo: MOTIVO_INSCRIPTO_SIN_ALICUOTA };
    if (alicuota === EXENTO || alicuota === NO_GRAVADO) {
      return { ok: false, motivo: MOTIVO_EXENTO_O_NO_GRAVADO };
    }
    if (DIVISOR_POR_ALICUOTA[alicuota] === undefined) {
      return {
        ok: false,
        motivo: `La alícuota de IVA de un producto de esta venta (código ${alicuota}) no es una de ARCA: corregila en el producto y reintentá.`,
      };
    }
    const cobrados = cobradoPorAlicuota.get(alicuota) ?? [];
    cobrados.push(renglon.total);
    cobradoPorAlicuota.set(alicuota, cobrados);
  }

  const total = sumarAlCentavo(venta.renglones.map((r) => r.total));
  if (centavosDe(total) !== centavosDe(venta.total)) {
    return { ok: false, motivo: MOTIVO_RENGLONES_NO_SUMAN };
  }

  const iva: SubtotalIva[] = [];
  for (const alicuotaId of [...cobradoPorAlicuota.keys()].sort((x, y) => x - y)) {
    const cobrado = sumarAlCentavo(cobradoPorAlicuota.get(alicuotaId) ?? []);
    // Un grupo en cero (productos sin cargo) no aporta base ni IVA: no se informa.
    if (centavosDe(cobrado) === 0) continue;
    const base = redondear(cobrado / DIVISOR_POR_ALICUOTA[alicuotaId]);
    iva.push({ alicuotaId, base, importe: redondear(cobrado - base) });
  }
  return {
    ok: true,
    impuestos: { neto: sumarAlCentavo(iva.map((s) => s.base)), iva, total },
    ivaPorProducto: true,
  };
}
