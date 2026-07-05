/**
 * CORE PAGOS — contrato provider-agnóstico del gateway de cobros.
 *
 * Es la abstracción sobre la que hablan la ingesta, la clasificación y el glue
 * de cobros: NUNCA contra un proveedor concreto. Cada proveedor (Mercado Pago
 * primero; mañana MODO / Stripe / etc.) aporta un ADAPTER que implementa
 * `GatewayPagos` y normaliza sus pagos a `PagoNormalizado`. Mismo patrón
 * hexagonal que ARCA (port + adapters real/stub).
 *
 * Regla de dependencias: este módulo NO importa ningún proveedor. Los
 * proveedores importan de acá, no al revés.
 */

/**
 * Estado normalizado de un cobro (vocabulario común a todos los proveedores).
 * Solo `approved` es facturable; el resto frena la facturación (ver clasificador).
 */
export type EstadoPago =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "in_process"
  | "refunded";

/**
 * Tipo de operación normalizado (insumo del clasificador de ingresos): no todo
 * ingreso es una venta facturable. Transferencias entre cuentas propias,
 * devoluciones/reintegros y préstamos NO se facturan.
 */
export type TipoOperacion =
  | "pago" // cobro a un cliente → típicamente FACTURABLE
  | "transferencia" // entre cuentas propias → NO_FACTURABLE
  | "devolucion" // refund → NO_FACTURABLE
  | "reintegro" // cashback/reintegro del gateway → NO_FACTURABLE
  | "prestamo" // adelanto/préstamo del gateway → NO_FACTURABLE
  | "otro"; // desconocido → REVISAR

/**
 * Un cobro normalizado, tal como lo entrega cualquier gateway (solo lo que le
 * importa al dominio; cada adapter mapea su payload crudo a esto).
 */
export interface PagoNormalizado {
  /** Id del pago en el gateway (idempotencia de la ingesta). */
  id: string;
  estado: EstadoPago;
  /** Monto bruto de la operación. */
  monto: number;
  /**
   * Referencia externa que ata el pago a nuestro dominio (p.ej. `appointmentId`).
   * Puede venir vacía: una venta directa no siempre corresponde a un turno.
   */
  externalReference: string;
  /** Fecha de acreditación en formato ARCA `AAAAMMDD` (fecha del comprobante). */
  fechaAcreditacion?: string;
  /** Comisión que retiene el gateway (informativa; no cambia el neto a facturar). */
  comision?: number;
  /** Descripción de la operación (para el detalle de la factura). */
  descripcion?: string;
  /** Tipo de operación (insumo del clasificador). Default "pago". */
  operacion?: TipoOperacion;
  /** Id de la contraparte (pagador/receptor). Clave para detectar cuentas propias. */
  contraparteId?: string;
  /** Nombre de la contraparte (para el panel y el aprendizaje del clasificador). */
  contraparteNombre?: string;
}

/** Criterio de búsqueda para traer el historial paginado (backfill). */
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
  pagos: PagoNormalizado[];
  /** Cursor de la próxima página; ausente = no hay más. */
  nextCursor?: string;
}

/**
 * Gateway de cobros. Un adapter lo implementa contra la API real del proveedor
 * (Mercado Pago, etc.); el stub lo implementa en memoria para dev/test.
 *
 * Las dos fuentes de un pago —la notificación (webhook) y el backfill del
 * historial— convergen en la ingesta idempotente por `id`.
 */
export interface GatewayPagos {
  /** Verifica un pago contra el proveedor (una notificación trae solo el id). */
  getPayment(paymentId: string): Promise<PagoNormalizado>;

  /** Trae el historial de pagos acreditados, paginado (backfill). */
  listPayments(criterio: CriterioBusqueda): Promise<PaginaPagos>;
}
