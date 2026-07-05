/**
 * PORT del plugin Mercado Pago (ADR-024 §2.d). El plugin habla con MP solo por
 * esta interface; adapters: real (API de MP, pendiente) y stub (memoria).
 */

/** Estados de pago de Mercado Pago. */
export type EstadoPagoMP =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "in_process"
  | "refunded";

/** Un pago tal como lo devuelve MP (normalizado a lo que nos importa). */
export interface PagoMP {
  id: string;
  estado: EstadoPagoMP;
  /** Monto bruto de la operación. */
  monto: number;
  /**
   * Referencia externa que atamos a nuestro dominio. En el ERP = `appointmentId`
   * (ADR-024). En el producto standalone (ADR-025) puede venir vacío: la venta
   * MP no es un turno; se factura igual como venta directa.
   */
  externalReference: string;
  /** Fecha de acreditación en formato ARCA `AAAAMMDD` (para la fecha del comprobante). */
  fechaAcreditacion?: string;
  /** Comisión que retiene MP (informativa; no cambia el neto a facturar). */
  comision?: number;
  /** Descripción de la operación (para el detalle de la factura). */
  descripcion?: string;
}

/** Criterio de búsqueda para traer el historial paginado (ADR-025 §2). */
export interface CriterioBusqueda {
  /** Desde (inclusive), `AAAAMMDD`. */
  desde?: string;
  /** Hasta (inclusive), `AAAAMMDD`. */
  hasta?: string;
  /** Cursor de paginación (opaco); ausente = primera página. */
  cursor?: string;
  /** Tamaño de página. */
  limit?: number;
}

/** Una página del historial de pagos. */
export interface PaginaPagos {
  pagos: PagoMP[];
  /** Cursor de la próxima página; ausente = no hay más. */
  nextCursor?: string;
}

/** Credenciales de MP por tenant. Secretas: entran por config, no al repo. */
export interface MercadoPagoConfig {
  accessToken: string;
}

/** Cliente de Mercado Pago. */
export interface MercadoPagoClient {
  /** Verifica un pago contra MP (una notificación trae solo el id). */
  getPayment(paymentId: string): Promise<PagoMP>;

  /**
   * Trae el historial de pagos acreditados, paginado (ADR-025 §2, backfill).
   * Es la otra fuente además del webhook; ambas convergen en la ingesta idempotente.
   */
  listPayments(criterio: CriterioBusqueda): Promise<PaginaPagos>;
}
