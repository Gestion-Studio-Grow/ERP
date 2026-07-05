/**
 * Registro de conciliación pago↔factura (ADR-025 §3). Es la garantía de
 * no-duplicación (idempotencia por `payment_id`) y, a la vez, el estado del
 * producto (cuántos pagos entraron, cuántos facturados, cuántos con error).
 *
 * Port + stub en memoria. La versión real es una tabla con unique sobre
 * `payment_id` (por tenant), pendiente de migración (ADR-025 §8).
 */

/**
 * Estado de un pago en la conciliación. FACTURADO/NO_FACTURABLE/REVISAR son
 * terminales para la ingesta (no se reprocesan); ERROR es transitorio (se
 * reintenta). REVISAR = clasificado como dudoso, espera decisión humana (§12.1).
 */
export type EstadoConciliacion = "FACTURADO" | "NO_FACTURABLE" | "REVISAR" | "ERROR";

export interface RegistroConciliacion {
  paymentId: string;
  estado: EstadoConciliacion;
  invoiceId?: string;
  motivo?: string;
}

export interface ReconciliacionPort {
  /**
   * ¿El pago ya tiene una decisión tomada? (idempotencia). true si está
   * FACTURADO / NO_FACTURABLE / REVISAR; false si no existe o quedó en ERROR
   * (reintentable).
   */
  yaProcesado(paymentId: string): Promise<boolean>;
  /** Marca un pago como facturado, atándolo a su factura. */
  marcarFacturado(paymentId: string, invoiceId: string): Promise<void>;
  /** Marca un pago como no facturable (clasificación, §12.1). */
  marcarNoFacturable(paymentId: string, motivo: string): Promise<void>;
  /** Marca un pago para revisión humana (panel §12.2 / WhatsApp §12.4). */
  marcarRevisar(paymentId: string, motivo: string): Promise<void>;
  /** Marca un pago como fallido transitorio (para reintento). */
  marcarError(paymentId: string, motivo: string): Promise<void>;
  /** Estado actual (para el panel del contador / dashboard de conciliación). */
  listar(): Promise<RegistroConciliacion[]>;
}

const TERMINALES: EstadoConciliacion[] = ["FACTURADO", "NO_FACTURABLE", "REVISAR"];

/** Stub en memoria del registro de conciliación (para el simulador/tests). */
export class ReconciliacionEnMemoria implements ReconciliacionPort {
  private registros = new Map<string, RegistroConciliacion>();

  async yaProcesado(paymentId: string): Promise<boolean> {
    const estado = this.registros.get(paymentId)?.estado;
    return estado !== undefined && TERMINALES.includes(estado);
  }

  async marcarFacturado(paymentId: string, invoiceId: string): Promise<void> {
    this.registros.set(paymentId, { paymentId, estado: "FACTURADO", invoiceId });
  }

  async marcarNoFacturable(paymentId: string, motivo: string): Promise<void> {
    this.registros.set(paymentId, { paymentId, estado: "NO_FACTURABLE", motivo });
  }

  async marcarRevisar(paymentId: string, motivo: string): Promise<void> {
    this.registros.set(paymentId, { paymentId, estado: "REVISAR", motivo });
  }

  async marcarError(paymentId: string, motivo: string): Promise<void> {
    this.registros.set(paymentId, { paymentId, estado: "ERROR", motivo });
  }

  async listar(): Promise<RegistroConciliacion[]> {
    return [...this.registros.values()];
  }
}
