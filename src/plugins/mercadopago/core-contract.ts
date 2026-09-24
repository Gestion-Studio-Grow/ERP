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

// ── El link de pago de un PEDIDO ─────────────────────────────────────────────
//
// El link que se genera desde la bandeja lleva como `external_reference` el pedido, con un
// prefijo que lo distingue del turno (que va pelado, por compatibilidad con los links que ya
// existen). Cuando Mercado Pago avisa que ese pago se acreditó, el plugin no factura: le pide
// al Core que COBRE el pedido (`CobrarPedidoPorPago`), con el mismo cobro que el botón «Cobrar».
// El formato vive acá, en un solo lugar: lo arma el que genera el link y lo lee el que recibe
// el aviso.

export const PREFIJO_REFERENCIA_PEDIDO = "pedido:";

/** La `external_reference` del link de un pedido. PURA. */
export function referenciaDePedido(orderId: string): string {
  return `${PREFIJO_REFERENCIA_PEDIDO}${orderId}`;
}

/** El id del pedido de una `external_reference`, o null si no es de un pedido. PURA. */
export function pedidoDeReferencia(ref: string | null | undefined): string | null {
  const r = String(ref ?? "").trim();
  if (!r.startsWith(PREFIJO_REFERENCIA_PEDIDO)) return null;
  const id = r.slice(PREFIJO_REFERENCIA_PEDIDO.length).trim();
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/**
 * ¿Este pago es una VENTA DIRECTA (sin pedido ni turno detrás) y va al camino suelto —clasificar
 * → reglas del dueño → factura sola o cola de revisión—? Sólo si no trae `external_reference`.
 * PURA.
 *
 * Es el criterio del aviso (`procesarNotificacionPago`) y del sincronizado de la historia
 * (`ClasificadorPorReglas`), en UN lugar. Antes el sincronizado no lo miraba: un pago aprobado
 * de un link de pedido ("pedido:<id>") caía en la regla "pago-cobro" y salía una factura suelta,
 * sin pedido; después «Facturar» en Ventas del día emitía OTRA por la misma venta. Lo mismo con
 * el pago de un turno (referencia = id del turno), que se factura con el turno.
 */
export function esVentaDirecta(ref: string | null | undefined): boolean {
  return String(ref ?? "").trim() === "";
}

/** Lo que el Core contesta cuando se le pide cobrar un pedido por un pago acreditado. */
export type ResultadoCobroPedido =
  | { cobrado: true; code: number; total: number }
  | { cobrado: false; motivo: string; detalle: string; code?: number };

/**
 * Comando del Core que cobra el pedido de un pago acreditado (el mismo cobro del botón
 * «Cobrar»: sólo lo no cobrado, con el asiento en el libro). Idempotente por pedido.
 */
export type CobrarPedidoPorPago = (aviso: {
  tenantId: string;
  orderId: string;
  paymentId: string;
  monto: number;
}) => Promise<ResultadoCobroPedido>;
