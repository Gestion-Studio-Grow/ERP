/**
 * Registro de conciliación pago↔factura (ADR-025 §3). Es la garantía de
 * no-duplicación (idempotencia por `payment_id`) y, a la vez, el estado del
 * producto (cuántos pagos entraron, cuántos facturados, cuántos con error).
 *
 * Port + stub en memoria. La versión real es una tabla con unique sobre
 * `payment_id` (por tenant), pendiente de migración (ADR-025 §8).
 */

/**
 * Estado de un pago en la conciliación.
 * - FACTURADO / NO_FACTURABLE / REVISAR / RECHAZADO son **terminales** para la
 *   ingesta (no se reprocesan).
 * - ERROR es **transitorio** (se reintenta hasta un tope; luego escala a REVISAR).
 * REVISAR = espera decisión humana (§12.1). RECHAZADO = ARCA lo rechazó (§12/§8).
 */
export type EstadoConciliacion =
  | "FACTURADO"
  | "NO_FACTURABLE"
  | "REVISAR"
  | "RECHAZADO"
  | "ERROR";

export interface RegistroConciliacion {
  paymentId: string;
  estado: EstadoConciliacion;
  invoiceId?: string;
  motivo?: string;
  /** Intentos de facturación fallidos (para reintento con tope). */
  intentos?: number;
}

export interface ReconciliacionPort {
  /**
   * ¿El pago ya tiene una decisión terminal? (idempotencia). true si está
   * FACTURADO / NO_FACTURABLE / REVISAR / RECHAZADO; false si no existe o quedó
   * en ERROR (reintentable).
   */
  yaProcesado(paymentId: string): Promise<boolean>;
  /** Marca un pago como facturado, atándolo a su factura. */
  marcarFacturado(paymentId: string, invoiceId: string): Promise<void>;
  /** Marca un pago como no facturable (clasificación, §12.1). */
  marcarNoFacturable(paymentId: string, motivo: string): Promise<void>;
  /** Marca un pago para revisión humana (panel §12.2 / WhatsApp §12.4). */
  marcarRevisar(paymentId: string, motivo: string): Promise<void>;
  /** Marca un pago rechazado por ARCA (terminal, no reintentable). */
  marcarRechazado(paymentId: string, motivo: string): Promise<void>;
  /** Registra un fallo transitorio y devuelve el nº de intentos acumulados. */
  marcarError(paymentId: string, motivo: string): Promise<number>;
  /** Estado actual (para el panel del contador / dashboard de conciliación). */
  listar(): Promise<RegistroConciliacion[]>;
}

const TERMINALES: EstadoConciliacion[] = ["FACTURADO", "NO_FACTURABLE", "REVISAR", "RECHAZADO"];

/** Stub en memoria del registro de conciliación (para el simulador/tests). */
export class ReconciliacionEnMemoria implements ReconciliacionPort {
  private registros = new Map<string, RegistroConciliacion>();

  async yaProcesado(paymentId: string): Promise<boolean> {
    const estado = this.registros.get(paymentId)?.estado;
    return estado !== undefined && TERMINALES.includes(estado);
  }

  private set(paymentId: string, estado: EstadoConciliacion, extra: Partial<RegistroConciliacion> = {}): void {
    const prev = this.registros.get(paymentId);
    this.registros.set(paymentId, { paymentId, estado, intentos: prev?.intentos, ...extra });
  }

  async marcarFacturado(paymentId: string, invoiceId: string): Promise<void> {
    this.set(paymentId, "FACTURADO", { invoiceId });
  }

  async marcarNoFacturable(paymentId: string, motivo: string): Promise<void> {
    this.set(paymentId, "NO_FACTURABLE", { motivo });
  }

  async marcarRevisar(paymentId: string, motivo: string): Promise<void> {
    this.set(paymentId, "REVISAR", { motivo });
  }

  async marcarRechazado(paymentId: string, motivo: string): Promise<void> {
    this.set(paymentId, "RECHAZADO", { motivo });
  }

  async marcarError(paymentId: string, motivo: string): Promise<number> {
    const intentos = (this.registros.get(paymentId)?.intentos ?? 0) + 1;
    this.registros.set(paymentId, { paymentId, estado: "ERROR", motivo, intentos });
    return intentos;
  }

  async listar(): Promise<RegistroConciliacion[]> {
    return [...this.registros.values()];
  }
}
