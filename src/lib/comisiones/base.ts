// Base de comisión y vouchers (regla del dueño, 05/11/2026): la comisión de la profesional se calcula
// sobre el bruto MENOS lo pagado con voucher, cobro a cobro.
//
// Cómo se paga con voucher (docs/tenants/ch/VOUCHERS-OPENKEY.md): el voucher es un cobro del turno con
// medio de pago `VOUCHER` (una fila `Collection` como cualquier otra, que no entra al cajón: la paga
// OpenKey en su liquidación). Por eso la regla se resuelve con lo que ya trae el cobro, sin leer las
// tablas de vouchers: un cobro con `method: "VOUCHER"` es voucher entero; uno de otro medio, 0. Si
// algún día existe un cobro combinado, `voucherCentavos` dice qué parte fue voucher.
//
// Pura y en centavos. Un cobro anulado vale 0.

import { centavosDe, redondearAlCentavo } from "@/lib/dinero/redondeo";

export type CobroParaComision = {
  /** Total del cobro, en centavos. */
  totalCentavos: number;
  /** Medio de pago del cobro (`Collection.method`). `VOUCHER` = el cobro entero fue voucher. */
  method?: string | null;
  /** Parte del cobro pagada con voucher, en centavos, para un cobro combinado (gana sobre `method`). */
  voucherCentavos?: number | null;
  /** Cobro anulado: no comisiona ni descuenta. */
  anulado?: boolean;
};

export const MEDIO_VOUCHER = "VOUCHER";

/** Lo pagado con voucher en ESTE cobro, en centavos: 0 si no hubo o si el cobro está anulado. PURA. */
export function montoVoucherDelCobro(cobro: CobroParaComision): number {
  if (cobro.anulado === true) return 0;
  const total = Number.isFinite(cobro.totalCentavos) ? Math.max(0, Math.trunc(cobro.totalCentavos)) : 0;
  const voucher = cobro.voucherCentavos;
  if (voucher != null) {
    if (!Number.isFinite(voucher) || voucher <= 0) return 0;
    return Math.min(Math.trunc(voucher), total);
  }
  return cobro.method === MEDIO_VOUCHER ? total : 0;
}

/** Una fila `Collection` del turno, como la leen la liquidación y el listado de pendientes. */
export type FilaParaComision = { amount: number; method?: string | null };

/**
 * Lo pagado con voucher en el TURNO, neto de anulaciones, en centavos. PURA.
 *
 * Anular un cobro escribe su contrapartida NEGATIVA con el mismo medio (`anulacion.ts`), así que
 * el voucher neto es la suma con signo de los cobros `VOUCHER`: cobro +4.000 y su anulación
 * −4.000 dan 0. Una condonación nunca es `VOUCHER` (se asienta como EFECTIVO), no entra. Nunca < 0.
 */
export function voucherNetoDelTurno(filas: readonly FilaParaComision[]): number {
  let neto = 0;
  for (const f of filas) {
    const c = centavosDe(Number(f.amount));
    if (!Number.isFinite(c) || c === 0) continue;
    const v = montoVoucherDelCobro({ totalCentavos: Math.abs(c), method: f.method });
    neto += c < 0 ? -v : v;
  }
  return Math.max(0, neto);
}

/**
 * Base de la comisión del turno, en PESOS: lo cobrado (`Payment.amount`, que incluye lo pagado con
 * voucher) MENOS lo pagado con voucher. Cobro de $10.000 con $4.000 de voucher → base $6.000.
 * Nunca < 0. PURA. La usan la liquidación (commission-actions.ts) y el listado (reports/comisiones.ts).
 */
export function baseDeComision(cobrado: number, filas: readonly FilaParaComision[]): number {
  const cobradoCentavos = centavosDe(Number(cobrado));
  if (!Number.isFinite(cobradoCentavos)) return 0;
  const baseCentavos = Math.max(0, cobradoCentavos - voucherNetoDelTurno(filas));
  return redondearAlCentavo(baseCentavos / 100);
}
