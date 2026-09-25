/**
 * Webhook handler del plugin Mercado Pago (ADR-024 §2.d).
 *
 *   Notificación MP (payment.updated)
 *     → verificar el pago contra MP (getPayment)
 *     → si está aprobado:
 *         · link de un PEDIDO (external_reference = "pedido:<id>") → COBRAR el pedido
 *           (comando `cobrarPedido` del Core: el mismo cobro del botón «Cobrar»);
 *         · si no → AUTO-FACTURAR el turno (external_reference = appointmentId).
 *
 * "Auto" a propósito: lo que entra por MP se factura como corresponde
 * fiscalmente (ignora el toggle "facturar sí/no", que es solo para el cierre
 * manual). El plugin no toca la DB del Core: llama al comando `facturar`.
 *
 * El pago de un pedido NO se factura acá: se cobra (entra al libro) y la factura la pide el
 * mostrador con «Facturar», igual que una venta cobrada en efectivo.
 */

import { MercadoPagoClient } from "./port";
import {
  duenoDelCobro,
  type CobrarPedidoPorPago,
  type FacturarPorPago,
  type NotificacionPagoMP,
  type ResultadoCobroPedido,
} from "./core-contract";

export interface MpHandlerDeps {
  /** Resuelve el cliente MP del tenant (sus credenciales). Hoy: stub. */
  clientePara: (tenantId: string) => MercadoPagoClient | Promise<MercadoPagoClient>;
  /** Comando del Core que factura el turno acreditado (auto-factura). */
  facturar: FacturarPorPago;
  /**
   * Comando del Core que cobra el pedido de un link de pago. Opcional para no romper a quien
   * todavía no lo cablea: sin él, el pago de un pedido se reconoce y NO se factura como si
   * fuera un turno (el motivo lo dice).
   */
  cobrarPedido?: CobrarPedidoPorPago;
}

export interface ResultadoNotificacion {
  procesado: boolean;
  facturado: boolean;
  invoiceId: string | null;
  motivo?: string;
  /** Presente cuando el pago era de un pedido: qué contestó el Core al cobrarlo. */
  pedido?: ResultadoCobroPedido;
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

  // La misma lectura de la referencia que la ingesta de ventas sueltas (core-contract.ts): un
  // cobro, un solo camino de factura.
  const dueno = duenoDelCobro(pago.externalReference);
  if (!dueno) {
    return { procesado: true, facturado: false, invoiceId: null, motivo: "pago sin external_reference (appointmentId)" };
  }

  // El link de un pedido: se cobra el pedido, con el monto que Mercado Pago dice que se pagó
  // (el Core lo compara con el total del pedido en la base antes de cobrar).
  if (dueno.tipo === "pedido") {
    const orderId = dueno.id;
    if (!deps.cobrarPedido) {
      return { procesado: true, facturado: false, invoiceId: null, motivo: "pago de pedido: el cobro de pedidos no está conectado" };
    }
    const pedido = await deps.cobrarPedido({
      tenantId: notif.tenantId,
      orderId,
      paymentId: pago.id,
      monto: pago.monto,
    });
    return {
      procesado: true,
      facturado: false,
      invoiceId: null,
      motivo: pedido.cobrado ? `pedido #${pedido.code} cobrado` : `pedido no cobrado: ${pedido.motivo}`,
      pedido,
    };
  }

  const invoiceId = await deps.facturar(dueno.id, notif.tenantId);
  return { procesado: true, facturado: invoiceId != null, invoiceId };
}
