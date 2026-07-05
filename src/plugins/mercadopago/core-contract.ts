/**
 * Contrato del plugin Mercado Pago con el Core (ADR-024). Tipos, no código: el
 * plugin no importa el Core. El comando lo inyecta el borde (route/worker).
 */

/** Notificación que MP manda al webhook (trae solo tipo + id de recurso). */
export interface NotificacionPagoMP {
  /** Tipo de notificación de MP (nos interesa "payment"). */
  type: string;
  /** Id del pago a verificar contra MP. */
  paymentId: string;
  /** Tenant destino (resuelto por la ruta del webhook, ADR-001). */
  tenantId: string;
}

/**
 * Comando del Core que el plugin invoca cuando un pago se acredita: factura el
 * turno asociado. Devuelve el `invoiceId`, o `null` si no se pudo facturar.
 * Es el mismo `facturarAppointment` del Core (superficie de comando).
 */
export type FacturarPorPago = (
  appointmentId: string,
  tenantId: string,
) => Promise<string | null>;
