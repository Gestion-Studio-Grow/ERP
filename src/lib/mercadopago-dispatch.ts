/**
 * Glue del Core para el plugin Mercado Pago (ADR-024). Es el único módulo que
 * conoce ambos lados: inyecta el cliente MP del tenant y el comando del Core
 * (`facturarAppointment`) al handler del plugin. El plugin no importa el Core.
 */

import {
  procesarNotificacionPago,
  StubMercadoPagoClient,
  type MercadoPagoClient,
  type NotificacionPagoMP,
  type ResultadoNotificacion,
} from "@/plugins/mercadopago";
import { facturarAppointment } from "@/lib/invoice-from-appointment";

/**
 * Resuelve el cliente MP del tenant.
 *
 * TODO(ADR-024): hoy devuelve el STUB (sin pagos sembrados → prod nunca llega
 * acá porque el flag de facturación está OFF). La versión real lee el
 * `accessToken` del tenant (config del manifiesto) y devuelve el adapter contra
 * la API de MP.
 */
export function clienteMpPara(_tenantId: string): MercadoPagoClient {
  return new StubMercadoPagoClient();
}

/** Procesa una notificación de MP: verifica el pago y, si se acreditó, factura. */
export function manejarNotificacionMP(
  notif: NotificacionPagoMP,
): Promise<ResultadoNotificacion> {
  return procesarNotificacionPago(notif, {
    clientePara: clienteMpPara,
    facturar: facturarAppointment,
  });
}
