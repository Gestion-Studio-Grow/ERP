// CUÁNDO se factura un turno que queda con saldo a cobrar (decisión D4, UAT 16/10). PURO.
//
// ⚠️ REQUIERE OK DEL DUEÑO O DE LA CONTADORA ANTES DE PUBLICAR (Factory-GSG,
// 30-LANZAMIENTO/calidad/PLAN-HUECOS-P0.md §2 D4).
//
// Antes: al completar con "dejar saldo a cobrar" se facturaba lo cobrado hasta ahí
// (`payment.amount`) y el saldo, cuando entraba, no se facturaba nunca.
//
// Lo recomendado en D4 es "facturar el saldo al cobrarlo", o sea un SEGUNDO comprobante por el
// saldo. La base no lo permite sin migración: `Invoice` tiene `@@unique([tenantId,
// appointmentId])` (un comprobante por turno, la llave de idempotencia de I2/ADR-064), y esta
// tanda no toca migraciones. Lo que se implementa, sin migración y con la misma regla de fondo
// ("no se factura plata que no entró, y toda la que entró termina facturada"):
//   - completar SIN saldo pendiente → se factura como siempre, en el acto;
//   - completar CON saldo pendiente → todavía no se factura;
//   - cuando el turno terminado queda SALDADO (se cobró lo que faltaba) → una factura por el
//     total cobrado;
//   - cuando el saldo se da de baja (condonación) → una factura por lo que sí se cobró.
// Si al completar se eligió "No facturar", esa elección vale también para después. Ante la duda
// (la elección no quedó registrada) no se factura solo; y sin plata cobrada, nunca.
//
// Para la contadora: por la Ley de IVA (art. 5 inc. b) el hecho imponible de una prestación de
// servicios nace al terminarla o al percibir el precio, lo que ocurra antes; esta regla demora
// la factura de lo ya cobrado hasta que el turno se salda. Es exactamente lo que hay que
// confirmar antes de publicar. La alternativa "dos comprobantes por turno" pide una migración
// (sacar la unique o atar la factura al cobro) con su propio Gate 2.

/** Al completar: ¿se factura en el acto? Sólo si no queda saldo a cobrar. */
export function facturarAlCompletar(saldoACobrar: number): boolean {
  return !(saldoACobrar > 0);
}

/**
 * Después de un cobro o de dar de baja el saldo: ¿hay que emitir ahora la factura que quedó
 * esperando? Sólo para un turno ya terminado, sin saldo, y si al completar no se eligió
 * "No facturar". (Si ya tiene factura, `facturarAppointment` la reusa: no hay doble.)
 */
export function facturarAlSaldar(t: { status: string; saldo: number; noFacturarAlCompletar: boolean }): boolean {
  return t.status === "COMPLETED" && !(t.saldo > 0) && !t.noFacturarAlCompletar;
}
