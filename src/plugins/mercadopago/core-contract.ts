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
 * Quién es dueño de un cobro según su `external_reference`. PURA. Es la ÚNICA lectura de la
 * referencia: la usan el aviso de Mercado Pago (handler.ts) y la ingesta de ventas sueltas
 * (ingest.ts), para que un mismo cobro tenga un solo camino de factura.
 *  - sin referencia → null: venta suelta, la factura la ingesta (origen MP_PAYMENT);
 *  - "pedido:<id>" → el pedido: se cobra y la factura sale de la venta (origen ORDER);
 *  - cualquier otra → un turno (va pelada, por los links que ya existen): la factura es la del
 *    turno (origen APPOINTMENT).
 */
export type DuenoDelCobro = { tipo: "pedido"; id: string } | { tipo: "turno"; id: string };

export function duenoDelCobro(ref: string | null | undefined): DuenoDelCobro | null {
  if (!ref) return null;
  const orderId = pedidoDeReferencia(ref);
  return orderId ? { tipo: "pedido", id: orderId } : { tipo: "turno", id: ref };
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
