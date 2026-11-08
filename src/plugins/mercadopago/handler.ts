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
  seniaActiva,
  type SeniaPorPago,
  type SeniaFallida,
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
   * Comando del Core para la seña de un TURNO (seña obligatoria). Se llama con el pago aprobado
   * (antes de facturar) y con el pago devuelto/contracargado (`refunded`). Opcional.
   */
  senia?: SeniaPorPago;
  /**
   * Aviso del Core cuando `senia` tira (log + AuditLog). En el pago APROBADO la seña no bloquea la
   * facturación y el error se traga, salvo que el aviso conteste `"reintentar"` (500). En una
   * devolución/contracargo (`refunded`) se avisa y el error SUBE igual: el webhook contesta 500 y MP
   * reintenta (la plata devuelta no puede quedar en caja).
   */
  alFallarSenia?: SeniaFallida;
}

/**
 * La seña del pago APROBADO, envuelta: un fallo queda avisado y nunca sube (no bloquea la factura).
 * Sólo para ese camino: la devolución llama a `deps.senia` sin envolver.
 */
async function seniaSegura(deps: MpHandlerDeps, appointmentId: string, tenantId: string, pago: Parameters<SeniaPorPago>[2]): Promise<unknown> {
  if (!deps.senia) return null;
  try {
    return await deps.senia(appointmentId, tenantId, pago);
  } catch (e) {
    let tras: void | "reintentar" = undefined;
    try {
      tras = await deps.alFallarSenia?.(appointmentId, tenantId, pago, e);
    } catch {
      // El aviso del fallo tampoco puede bloquear: el Core ya lo loguea por su lado.
    }
    // El Core no pudo saber si la regla está prendida: 500 para que MP reintente (no se factura aún).
    if (tras === "reintentar") throw e;
    return null;
  }
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

  // Devolución total o contracargo de la seña de un turno: el Core anula ese cobro (no se factura).
  if (pago.estado === "refunded" && deps.senia) {
    const duenoDevuelto = duenoDelCobro(pago.externalReference);
    if (duenoDevuelto?.tipo === "turno") {
      // Si la anulación falla (p. ej. 40001 que agotó los reintentos) el error SUBE: el webhook
      // contesta 500 y MP reintenta. Tragarlo dejaría la seña devuelta en caja. Antes de relanzar,
      // el Core deja el aviso en la agenda (por si MP deja de reintentar); ese aviso nunca bloquea.
      let r: unknown;
      try {
        r = await deps.senia(duenoDevuelto.id, notif.tenantId, pago);
      } catch (e) {
        try {
          await deps.alFallarSenia?.(duenoDevuelto.id, notif.tenantId, pago, e);
        } catch {
          // El aviso no puede tapar el error original.
        }
        throw e;
      }
      // Regla apagada: cae a la respuesta de siempre («estado refunded»).
      if (seniaActiva(r)) return { procesado: true, facturado: false, invoiceId: null, motivo: "seña devuelta" };
    }
  }

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

  // La seña del turno (seña obligatoria): se registra y confirma ANTES de facturar.
  // Envuelta: un fallo de la seña nunca bloquea la factura (queda log + AuditLog).
  await seniaSegura(deps, dueno.id, notif.tenantId, pago);

  // R1 · se pasa el pago: el Core factura ESTE cobro (una factura por cobro), no el turno entero.
  const invoiceId = await deps.facturar(dueno.id, notif.tenantId, pago);
  return { procesado: true, facturado: invoiceId != null, invoiceId };
}
