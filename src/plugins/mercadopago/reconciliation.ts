/**
 * Registro de conciliación pago↔factura (ADR-025 §3). Es la garantía de
 * no-duplicación (idempotencia por `payment_id`) y, a la vez, el estado del
 * producto (cuántos pagos entraron, cuántos facturados, cuántos con error).
 *
 * Port + stub en memoria. La versión real es una tabla con unique sobre
 * `payment_id` (por tenant), pendiente de migración (ADR-025 §8).
 */

export type EstadoConciliacion = "FACTURADO" | "ERROR";

export interface RegistroConciliacion {
  paymentId: string;
  estado: EstadoConciliacion;
  invoiceId?: string;
  motivo?: string;
}

export interface ReconciliacionPort {
  /** ¿Ya se facturó este pago? (idempotencia: no volver a facturar). */
  yaFacturado(paymentId: string): Promise<boolean>;
  /** Marca un pago como facturado, atándolo a su factura. */
  marcarFacturado(paymentId: string, invoiceId: string): Promise<void>;
  /** Marca un pago como fallido (para reintento/inspección). */
  marcarError(paymentId: string, motivo: string): Promise<void>;
  /** Estado actual (para el dashboard de conciliación). */
  listar(): Promise<RegistroConciliacion[]>;
}

/** Stub en memoria del registro de conciliación (para el simulador/tests). */
export class ReconciliacionEnMemoria implements ReconciliacionPort {
  private registros = new Map<string, RegistroConciliacion>();

  async yaFacturado(paymentId: string): Promise<boolean> {
    return this.registros.get(paymentId)?.estado === "FACTURADO";
  }

  async marcarFacturado(paymentId: string, invoiceId: string): Promise<void> {
    this.registros.set(paymentId, { paymentId, estado: "FACTURADO", invoiceId });
  }

  async marcarError(paymentId: string, motivo: string): Promise<void> {
    this.registros.set(paymentId, { paymentId, estado: "ERROR", motivo });
  }

  async listar(): Promise<RegistroConciliacion[]> {
    return [...this.registros.values()];
  }
}
