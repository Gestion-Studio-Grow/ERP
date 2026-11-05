// Base de comisión y vouchers (regla del dueño, 05/11/2026): la comisión de la profesional se calcula
// sobre el bruto MENOS lo pagado con voucher, cobro a cobro.
//
// Cómo se paga con voucher en el ERP (docs/tenants/ch/VOUCHERS-OPENKEY.md): el voucher NO es un cobro.
// Al aplicarlo, el turno baja su precio (`priceAtBooking -= valorCubierto`, `discountAmount +=
// valorCubierto`, precedente del cupón) y la caja no se entera, porque no entró plata. Por eso una
// fila `Collection` real nunca trae plata de voucher y para ella esta función da 0: la liquidación
// que devenga sobre lo cobrado ya queda neta del voucher. OJO: si comisiones toma como bruto el
// precio de LISTA del servicio (no lo cobrado ni `priceAtBooking`), tiene que restar el voucher del
// turno (`Voucher.valorCubierto`) y no esta función; si toma `priceAtBooking`, ya viene neto.
//
// La función es pura y en centavos: quien arme el cobro con una parte de voucher (un cobro
// combinado, hoy inexistente) carga `voucherCentavos`; un cobro anulado vale 0.

export type CobroParaComision = {
  /** Total del cobro, en centavos. */
  totalCentavos: number;
  /** Parte del cobro pagada con voucher, en centavos (ausente/null = sin voucher). */
  voucherCentavos?: number | null;
  /** Cobro anulado: no comisiona ni descuenta. */
  anulado?: boolean;
};

/** Lo pagado con voucher en ESTE cobro, en centavos: 0 si no hubo o si el cobro está anulado. PURA. */
export function montoVoucherDelCobro(cobro: CobroParaComision): number {
  if (cobro.anulado === true) return 0;
  const total = Number.isFinite(cobro.totalCentavos) ? Math.max(0, Math.trunc(cobro.totalCentavos)) : 0;
  const voucher = cobro.voucherCentavos;
  if (voucher == null || !Number.isFinite(voucher) || voucher <= 0) return 0;
  return Math.min(Math.trunc(voucher), total);
}
