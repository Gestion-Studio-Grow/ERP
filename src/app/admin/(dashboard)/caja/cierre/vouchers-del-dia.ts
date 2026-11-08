// ============================================================================
// CIERRE DEL DÍA · VOUCHERS (CH, La Alameda) — el renglón del diseño nuevo. PURO.
// ============================================================================
//
// Lo cobrado con voucher es venta del día pero NO plata del cajón: lo paga la administración del
// country cuando se liquida. Por eso suma al TOTAL DEL DÍA y nunca a una columna que se cuenta
// (Efectivo, MP, Transferencia, Tarjeta). `null` = no hubo vouchers en el período (o el interruptor
// está apagado: `vouchersDelPeriodo` devuelve null y la pantalla no cambia).

import type { ColumnaDelCierre, VouchersDelCierre } from "@/lib/caja/cierre-diario";

export const ETIQUETA_VOUCHERS_A_COBRAR = "A cobrar a la administración (vouchers)";

export interface RenglonDeVouchers {
  etiqueta: string;
  /** Lo que entró por los medios que se cuentan (sin vouchers). */
  entroPorCaja: number;
  /** Neto de vouchers del período: cobrados menos anulados. */
  aCobrar: number;
  cantidad: number;
  anulados: { cantidad: number; monto: number };
  /** Lo que entró por caja más lo que queda a cobrar a la administración. */
  totalDelDia: number;
}

export function renglonDeVouchers(
  porColumna: Readonly<Record<ColumnaDelCierre, { ingresos: number }>>,
  columnas: readonly ColumnaDelCierre[],
  vouchers: VouchersDelCierre | null | undefined,
): RenglonDeVouchers | null {
  if (!vouchers) return null;
  const entroPorCaja = centavos(columnas.reduce((s, c) => s + (porColumna[c]?.ingresos ?? 0), 0));
  const aCobrar = centavos(vouchers.monto - vouchers.anulados.monto);
  return {
    etiqueta: ETIQUETA_VOUCHERS_A_COBRAR,
    entroPorCaja,
    aCobrar,
    cantidad: vouchers.cantidad,
    anulados: vouchers.anulados,
    totalDelDia: centavos(entroPorCaja + aCobrar),
  };
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}
