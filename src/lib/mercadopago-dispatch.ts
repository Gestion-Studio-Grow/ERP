/**
 * Glue del Core para el plugin Mercado Pago (ADR-024). Ata el handler del plugin
 * a dos cosas del Core: el gateway de cobros del tenant —resuelto por el registro
 * provider-agnóstico (`gatewayCobrosPara`, fase 3), no instanciado a mano— y el
 * comando `facturarAppointment`. El plugin no importa el Core.
 */

import {
  procesarNotificacionPago,
  type NotificacionPagoMP,
  type ResultadoNotificacion,
} from "@/plugins/mercadopago";
import { facturarAppointment } from "@/lib/invoice-from-appointment";
import { gatewayCobrosPara } from "@/lib/pagos-dispatch";
import { procesarPagoStandalone } from "@/lib/mercadopago-auto";
import { resolverReferenciasMP } from "@/lib/mercadopago-referencias";

/**
 * Procesa una notificación de MP: resuelve el gateway de cobros del tenant vía el
 * registro provider-agnóstico (`gatewayCobrosPara`, fase 3) — ya no instancia el
 * proveedor a mano — verifica el pago y, si se acreditó, factura.
 *
 * Caminos (ADR-024/025), según la venta de ESTE negocio detrás de la referencia — el mismo
 * resolutor que usa el sincronizado (`resolverReferenciasMP`):
 *  - Turno existente del negocio (`external_reference` = appointmentId) → factura el turno.
 *  - Venta directa (sin referencia, texto libre del link manual, turno inexistente, pedido de
 *    otro negocio) → pipeline standalone: clasificar → reglas del dueño (umbral/tope) →
 *    facturar o cola de revisión, unificado con el banco.
 *  - Pedido del negocio: el cobro de pedidos no está conectado acá (decisión del dueño
 *    pendiente), así que también va al pipeline, que lo deja EN REVISIÓN si no tiene factura
 *    y lo descarta con el motivo verdadero si ya la tiene (classifier.ts, paso 0).
 *
 * El handler del plugin habla `GatewayPagos` (su `MercadoPagoClient` es un alias
 * del mismo contrato), así que `gatewayCobrosPara` encaja directo como `clientePara`.
 */
export async function manejarNotificacionMP(
  notif: NotificacionPagoMP,
): Promise<ResultadoNotificacion> {
  const resultado = await procesarNotificacionPago(notif, {
    clientePara: (tenantId) => gatewayCobrosPara(tenantId),
    facturar: facturarAppointment,
    resolverReferencias: resolverReferenciasMP,
  });

  // Venta directa, o pago de un pedido del negocio sin el cobro conectado: al pipeline
  // unificado banco + Mercado Pago, que resuelve la referencia con el MISMO criterio.
  if (resultado.procesado && !resultado.facturado && resultado.aLaIngesta) {
    const resumen = await procesarPagoStandalone(notif.tenantId, notif.paymentId);
    return {
      procesado: true,
      facturado: resumen.facturados > 0,
      invoiceId: null,
      motivo:
        resumen.facturados > 0
          ? "venta directa facturada"
          : resumen.aRevisar > 0
            ? "venta directa en cola de revisión"
            : resumen.noFacturables > 0
              ? "no facturable (clasificador)"
              : resumen.saltados > 0
                ? "ya procesado (idempotencia)"
                : "error transitorio (se reintenta)",
    };
  }

  return resultado;
}
