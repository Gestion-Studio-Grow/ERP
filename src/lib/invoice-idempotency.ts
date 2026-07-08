// ============================================================================
// IDEMPOTENCIA de facturación de un turno — decisión PURA (hardening $0).
// ============================================================================
//
// Mercado Pago entrega la MISMA notificación de pago más de una vez (reintentos /
// entrega múltiple). Sin guarda, cada webhook `approved` del mismo pago crearía OTRA
// factura para el turno (la unique de numeración fiscal no protege: las PENDING tienen
// número NULL y no colisionan). La guarda durable es el `Payment` del turno
// (`appointmentId @unique` + `comprobanteNro`): una vez que el turno tiene comprobante,
// no se re-factura. **Cero migración** — reusa columnas existentes.
//
// Se extrae la DECISIÓN pura (como `cashSaleEligibility`) para blindarla con test sin DB;
// el efecto (crear factura + marcar el pago) vive en `invoice-from-appointment.ts`.

export type DecisionFacturacion =
  | { accion: "reusar"; comprobante: string }
  | { accion: "emitir" };

/**
 * ¿Hay que emitir factura para este turno, o ya tiene comprobante (reusar)? PURA.
 * `payment` = el `Payment` del turno (o null si no hay). Si ya trae `comprobanteNro`
 * → `reusar` (idempotente); si no → `emitir`.
 */
export function decidirFacturacion(
  payment: { comprobanteNro: string | null } | null | undefined,
): DecisionFacturacion {
  const comprobante = payment?.comprobanteNro;
  return comprobante ? { accion: "reusar", comprobante } : { accion: "emitir" };
}
