// ============================================================================
// CIERRE DEL DÍA · VOUCHERS (CH, La Alameda) — el renglón del diseño nuevo. PURO.
// ============================================================================
//
// Lo cobrado con voucher es venta del día pero NO plata del cajón: lo paga la administración del
// country cuando se liquida. Por eso suma al TOTAL DEL DÍA y nunca a una columna que se cuenta
// (Efectivo, MP, Transferencia, Tarjeta). `null` = no hubo vouchers en el período (o el interruptor
// está apagado: `vouchersDelPeriodo` devuelve null y la pantalla no cambia).

import type { ColumnaDelCierre, VouchersDelCierre } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

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
  const entroPorCaja = redondearAlCentavo(columnas.reduce((s, c) => s + (porColumna[c]?.ingresos ?? 0), 0));
  const aCobrar = redondearAlCentavo(vouchers.monto - vouchers.anulados.monto);
  return {
    etiqueta: ETIQUETA_VOUCHERS_A_COBRAR,
    entroPorCaja,
    aCobrar,
    cantidad: vouchers.cantidad,
    anulados: vouchers.anulados,
    totalDelDia: redondearAlCentavo(entroPorCaja + aCobrar),
  };
}

// ── Pagos de la administración (regla del dueño del 08/11) ──────────────────
//
// Cuando la administración paga, el pago entra al libro como cobro de cuenta corriente con la
// referencia `voucher-pago:<id>` (src/lib/vouchers/acreditacion-core.ts), en su medio: Mercado Pago
// (la cuenta bancaria del negocio) o Efectivo. YA está sumado en «Entró» de esa columna; este renglón
// sólo lo señala, para que quien cuenta MP sepa que puede no haberse acreditado todavía. Un cheque
// NO entra al libro hasta que se confirma el depósito: queda en «valores a depositar», aparte.

export const ETIQUETA_PAGOS_ADMINISTRACION = "Pagos de la administración (vouchers)";
export const ETIQUETA_CHEQUES_A_DEPOSITAR = "Cheques en valores a depositar";

export interface PagosDeLaAdministracion {
  cantidad: number;
  porMedio: { medio: CashMethod; monto: number; cantidad: number }[];
}

export function pagosDeLaAdministracion(
  movimientos: readonly { type: string; method: CashMethod; amount: number | null; referencia?: string | null }[],
): PagosDeLaAdministracion | null {
  const porMedio = new Map<CashMethod, { monto: number; cantidad: number }>();
  for (const m of movimientos) {
    if (m.type !== "INGRESO" || !m.amount || !String(m.referencia ?? "").startsWith("voucher-pago:")) continue;
    const x = porMedio.get(m.method) ?? { monto: 0, cantidad: 0 };
    porMedio.set(m.method, { monto: redondearAlCentavo(x.monto + m.amount), cantidad: x.cantidad + 1 });
  }
  if (porMedio.size === 0) return null;
  const lista = [...porMedio].map(([medio, x]) => ({ medio, ...x }));
  return { cantidad: lista.reduce((s, x) => s + x.cantidad, 0), porMedio: lista };
}
