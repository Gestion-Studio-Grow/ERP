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

/**
 * Procesa una notificación de MP: resuelve el gateway de cobros del tenant vía el
 * registro provider-agnóstico (`gatewayCobrosPara`, fase 3) — ya no instancia el
 * proveedor a mano — verifica el pago y, si se acreditó, factura.
 *
 * El handler del plugin habla `GatewayPagos` (su `MercadoPagoClient` es un alias
 * del mismo contrato), así que `gatewayCobrosPara` encaja directo como `clientePara`.
 */
export function manejarNotificacionMP(
  notif: NotificacionPagoMP,
): Promise<ResultadoNotificacion> {
  return procesarNotificacionPago(notif, {
    clientePara: (tenantId) => gatewayCobrosPara(tenantId),
    facturar: facturarAppointment,
  });
}
