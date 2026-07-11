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

/**
 * Procesa una notificación de MP: resuelve el gateway de cobros del tenant vía el
 * registro provider-agnóstico (`gatewayCobrosPara`, fase 3) — ya no instancia el
 * proveedor a mano — verifica el pago y, si se acreditó, factura.
 *
 * Dos caminos (ADR-024/025):
 *  - Pago atado a un turno (`external_reference` = appointmentId) → factura el turno.
 *  - Venta directa SIN referencia → pipeline standalone: clasificar → reglas del
 *    dueño (umbral/tope) → facturar o cola de revisión, unificado con el banco.
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
  });

  // Venta directa (sin turno): entra al pipeline unificado banco + Mercado Pago.
  if (resultado.procesado && !resultado.facturado && resultado.motivo?.includes("external_reference")) {
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
