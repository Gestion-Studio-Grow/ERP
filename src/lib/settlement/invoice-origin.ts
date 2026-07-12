// ============================================================================
// ENLACE Invoice → ORIGEN (D10, ADR-060 ajuste 2) — helper PURO.
// ============================================================================
//
// Fija de dónde salió una factura: la venta que la generó (un `Order` de mostrador o un
// `Appointment` de servicios). Se agrega AHORA porque hacerlo con facturas reales adentro
// es la migración más cara. Aditivo: FKs nullable en `Invoice`. Este helper traduce el
// origen (tipo + id) al fragmento de datos que consume `prisma.invoice.create/update`,
// para que el borde fiscal no arme el link a mano en cada llamador.

/**
 * Orígenes fiscales de una factura. ORDER/APPOINTMENT son ventas del ERP (subset de
 * CollectionOriginType: la deuda AR no factura). MP_PAYMENT (A-6) es un origen INVOICE-only:
 * un pago de Mercado Pago facturado directo (ADR-025), cuya clave de idempotencia es el
 * `payment_id` del gateway → un webhook duplicado NO genera una segunda factura.
 */
export type InvoiceOriginType = "ORDER" | "APPOINTMENT" | "MP_PAYMENT";

/** Fragmento de FK/clave para `prisma.invoice.{create,update}`. A lo sumo una. */
export interface InvoiceOriginLink {
  orderId?: string;
  appointmentId?: string;
  /** A-6 — id del pago en el gateway (Mercado Pago). Clave de dedupe del webhook. */
  mpPaymentId?: string;
}

/**
 * Construye el enlace de origen de una factura. PURA. `null`/vacío → objeto vacío (factura
 * sin origen, válido: las previas a D10 quedan así). Un tipo desconocido no inventa FK.
 */
export function buildInvoiceOriginLink(
  originType: InvoiceOriginType | null | undefined,
  originId: string | null | undefined,
): InvoiceOriginLink {
  const id = String(originId ?? "").trim();
  if (!id || !originType) return {};
  switch (originType) {
    case "ORDER":
      return { orderId: id };
    case "APPOINTMENT":
      return { appointmentId: id };
    case "MP_PAYMENT":
      return { mpPaymentId: id };
    default:
      return {};
  }
}
