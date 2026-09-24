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

// ── A qué venta pertenece un pago: UN criterio para el aviso y para el sincronizado ─────────
//
// La `external_reference` NO prueba nada por sí sola: el link de cobro manual del backoffice
// (facturacion/CobrosSection.tsx, cobros-actions.ts) acepta texto libre ("Seña Maria depilación",
// "PRUEBA-123"). Leerla como "tiene turno o pedido detrás" dejaba ventas reales sin factura para
// siempre (NO_FACTURABLE es terminal). Una referencia cuenta como venta SÓLO si el Core la
// encuentra EN ESTE NEGOCIO: el id de un turno existente o `pedido:<id>` de un pedido existente.
// Todo lo demás (vacía, texto libre, turno inexistente, pedido de otro negocio) es venta
// directa: va al camino suelto (clasificar → reglas del dueño → factura o revisión), como antes.
//
// Lo que se hace con cada caso (classifier.ts `decisionPorVenta`, handler.ts):
//   · venta ya facturada           → no se factura suelta (NO_FACTURABLE, "ya facturado con…");
//   · venta existente SIN factura  → a la cola de REVISIÓN (nunca NO_FACTURABLE): que la persona
//                                    la facture desde su venta o apruebe la factura suelta;
//   · no es venta del negocio      → camino suelto, igual que un pago sin referencia.

/** La `external_reference` normalizada (la clave con la que se resuelve). PURA. */
export function normalizarReferencia(ref: string | null | undefined): string {
  return String(ref ?? "").trim();
}

/** Un turno o un pedido EXISTENTE de este negocio, con lo que hace falta para decidir. */
export interface VentaDeReferencia {
  tipo: "turno" | "pedido";
  id: string;
  /** Cómo se la nombra en el motivo: "#77" (pedido) o "del 24/09/2026 10:30" (turno). */
  etiqueta: string;
  /** ¿Tiene una factura que no fue rechazada? (Invoice con su orderId/appointmentId, o la marca del turno). */
  facturada: boolean;
  /** Tiene factura, pero ARCA la rechazó: no cuenta como facturada. */
  facturaRechazada?: boolean;
}

/**
 * Resuelve un LOTE de referencias contra el Core, acotado al negocio: devuelve sólo las que son
 * un turno o un pedido existente de `tenantId`, con la referencia normalizada como clave. Las que
 * no están en el mapa no son ventas del negocio. Lo implementa el Core (mercadopago-referencias.ts)
 * con una cantidad fija de consultas por lote, no una por pago.
 */
export type ResolverReferencias = (
  tenantId: string,
  refs: readonly string[],
) => Promise<ReadonlyMap<string, VentaDeReferencia>>;

/**
 * La venta de ESTE negocio detrás de la referencia del pago. PURA.
 *   · `null`      → no hay venta detrás (sin referencia, texto libre, inexistente, de otro negocio);
 *   · `undefined` → hay una referencia y NO se pudo resolver (nadie pasó las resueltas).
 */
export function ventaDeReferencia(
  ref: string | null | undefined,
  resueltas: ReadonlyMap<string, VentaDeReferencia> | undefined,
): VentaDeReferencia | null | undefined {
  const r = normalizarReferencia(ref);
  if (!r) return null;
  if (!resueltas) return undefined;
  return resueltas.get(r) ?? null;
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
