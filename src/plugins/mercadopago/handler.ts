/**
 * Webhook handler del plugin Mercado Pago (ADR-024 §2.d).
 *
 *   Notificación MP (payment.updated)
 *     → verificar el pago contra MP (getPayment)
 *     → si está aprobado: AUTO-FACTURAR el turno (external_reference = appointmentId)
 *
 * "Auto" a propósito: lo que entra por MP se factura como corresponde
 * fiscalmente (ignora el toggle "facturar sí/no", que es solo para el cierre
 * manual). El plugin no toca la DB del Core: llama al comando `facturar`.
 */

import { MercadoPagoClient } from "./port";
import { FacturarPorPago, NotificacionPagoMP } from "./core-contract";

export interface MpHandlerDeps {
  /** Resuelve el cliente MP del tenant (sus credenciales). Hoy: stub. */
  clientePara: (tenantId: string) => MercadoPagoClient | Promise<MercadoPagoClient>;
  /** Comando del Core que factura el turno acreditado (auto-factura). */
  facturar: FacturarPorPago;
}

export interface ResultadoNotificacion {
  procesado: boolean;
  facturado: boolean;
  invoiceId: string | null;
  motivo?: string;
}

export async function procesarNotificacionPago(
  notif: NotificacionPagoMP,
  deps: MpHandlerDeps,
): Promise<ResultadoNotificacion> {
  if (notif.type !== "payment") {
    return { procesado: false, facturado: false, invoiceId: null, motivo: `tipo ignorado: ${notif.type}` };
  }

  const cliente = await deps.clientePara(notif.tenantId);
  const pago = await cliente.getPayment(notif.paymentId);

  if (pago.estado !== "approved") {
    // Pago no acreditado (pendiente/rechazado): no se factura. Idempotente:
    // una notificación posterior "approved" del mismo pago sí facturará.
    return { procesado: true, facturado: false, invoiceId: null, motivo: `estado ${pago.estado}` };
  }

  if (!pago.externalReference) {
    return { procesado: true, facturado: false, invoiceId: null, motivo: "pago sin external_reference (appointmentId)" };
  }

  const invoiceId = await deps.facturar(pago.externalReference, notif.tenantId);
  return { procesado: true, facturado: invoiceId != null, invoiceId };
}
