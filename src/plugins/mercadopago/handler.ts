/**
 * Webhook handler del plugin Mercado Pago (ADR-024 §2.d).
 *
 *   Notificación MP (payment.updated)
 *     → verificar el pago contra MP (getPayment)
 *     → si está aprobado, según la venta de ESTE negocio detrás de la referencia (el mismo
 *       criterio que el sincronizado, core-contract.ts `ResolverReferencias`):
 *         · un PEDIDO del negocio ("pedido:<id>") → COBRAR el pedido (comando `cobrarPedido`
 *           del Core: el mismo cobro del botón «Cobrar»); sin ese comando, a la ingesta;
 *         · un TURNO del negocio (external_reference = appointmentId) → AUTO-FACTURAR el turno;
 *         · nada del negocio (sin referencia, texto libre, inexistente) → a la ingesta, como
 *           venta directa.
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
  normalizarReferencia,
  pedidoDeReferencia,
  type CobrarPedidoPorPago,
  type ResolverReferencias,
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
  /**
   * El MISMO resolutor que usa el sincronizado (ingest.ts → classifier.ts): dice si la
   * referencia es un turno o un pedido EXISTENTE de este negocio. Con él, una referencia que no
   * lo es (texto libre del link manual, turno inexistente, pedido de otro negocio) va al camino
   * suelto como una venta directa, en vez de intentar facturar un "turno" que no existe y
   * quedar en nada. Sin él (tests viejos), se lee la referencia por su forma, como antes.
   */
  resolverReferencias?: ResolverReferencias;
}

export interface ResultadoNotificacion {
  procesado: boolean;
  facturado: boolean;
  invoiceId: string | null;
  motivo?: string;
  /** Presente cuando el pago era de un pedido: qué contestó el Core al cobrarlo. */
  pedido?: ResultadoCobroPedido;
  /**
   * true = el borde lo manda a la ingesta (clasificar → reglas del dueño → factura o cola de
   * revisión, mercadopago-dispatch.ts). Va ahí la venta directa (sin turno ni pedido del negocio
   * detrás) y el pago de un pedido del negocio mientras el cobro de pedidos no está conectado:
   * la ingesta lo deja en revisión si el pedido no tiene factura (classifier.ts, paso 0), en vez
   * de que el pago quede sin registrar.
   */
  aLaIngesta?: true;
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

  const ref = normalizarReferencia(pago.externalReference);
  const directa = {
    procesado: true,
    facturado: false,
    invoiceId: null,
    motivo: "venta directa: sin turno ni pedido del negocio detrás",
    aLaIngesta: true,
  } as const;
  if (!ref) return directa;

  // La referencia se resuelve con el criterio compartido (core-contract.ts): sólo cuenta como
  // turno o pedido si existe en ESTE negocio. Sin resolutor, por su forma (compat).
  const venta = deps.resolverReferencias
    ? ((await deps.resolverReferencias(notif.tenantId, [ref])).get(ref) ?? null)
    : undefined;
  if (venta === null) return directa;

  // El link de un pedido: se cobra el pedido, con el monto que Mercado Pago dice que se pagó
  // (el Core lo compara con el total del pedido en la base antes de cobrar).
  const orderId = venta ? (venta.tipo === "pedido" ? venta.id : null) : pedidoDeReferencia(ref);
  if (orderId) {
    if (!deps.cobrarPedido) {
      return {
        procesado: true,
        facturado: false,
        invoiceId: null,
        motivo: "pago de pedido: el cobro de pedidos no está conectado",
        // Verificado que es un pedido del negocio: a la ingesta, que lo deja en revisión si no
        // tiene factura (o lo descarta con el motivo verdadero si ya la tiene).
        ...(venta ? { aLaIngesta: true as const } : {}),
      };
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

  // Un turno (verificado, o por forma sin resolutor): se factura el turno. `facturarAppointment`
  // es idempotente: si el turno ya tiene comprobante, devuelve el mismo.
  const invoiceId = await deps.facturar(venta?.id ?? ref, notif.tenantId);
  return { procesado: true, facturado: invoiceId != null, invoiceId };
}
