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

/**
 * Tipo de operación de MP (insumo del clasificador de ingresos, ADR-025 §12.1).
 * No todo ingreso es una venta facturable: transferencias entre cuentas propias,
 * devoluciones/reintegros y préstamos NO se facturan.
 */
export type TipoOperacionMP =
  | "pago" // regular_payment: cobro a un cliente → típicamente FACTURABLE
  | "transferencia" // money_transfer entre cuentas propias → NO_FACTURABLE
  | "devolucion" // refund → NO_FACTURABLE
  | "reintegro" // reintegro/cashback de MP → NO_FACTURABLE
  | "prestamo" // adelanto/préstamo de MP → NO_FACTURABLE
  | "otro"; // desconocido → REVISAR

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
  /** Tipo de operación (insumo del clasificador, ADR-025 §12.1). Default "pago". */
  operacion?: TipoOperacionMP;
  /** Id de la contraparte (pagador/receptor). Clave para detectar cuentas propias. */
  contraparteId?: string;
  /** Nombre de la contraparte (para el panel y el aprendizaje). */
  contraparteNombre?: string;
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

/**
 * Credenciales OAuth de MP por cliente (ADR-025 §9). Se obtienen del flujo
 * *authorization code* (el comerciante autoriza una vez; NUNCA su contraseña ni
 * scraping). Secretas: cifradas at-rest por cliente, jamás al repo.
 */
export interface MercadoPagoConfig {
  /** Access token (corto). */
  accessToken: string;
  /** Refresh token (largo): renueva el access antes de vencer. */
  refreshToken?: string;
  /** Vencimiento del access token (epoch ms). Dispara el refresh. */
  expiresAt?: number;
  /** Id de la cuenta MP del comerciante (collector id). */
  collectorId?: string;
}

/**
 * Provee y refresca las credenciales OAuth de un cliente (ADR-025 §9).
 * Stub/DB-backed diferido: hoy el simulador no lo necesita (sin red).
 */
export interface CredencialesPort {
  /** Credenciales vigentes del cliente (refresca el token si está por vencer). */
  credencialesDe(tenantId: string): Promise<MercadoPagoConfig>;
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
