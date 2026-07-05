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
  monto: number;
  /** Referencia externa que atamos a nuestro dominio: el `appointmentId`. */
  externalReference: string;
}

/** Credenciales de MP por tenant. Secretas: entran por config, no al repo. */
export interface MercadoPagoConfig {
  accessToken: string;
}

/** Cliente de Mercado Pago. */
export interface MercadoPagoClient {
  /** Verifica un pago contra MP (una notificación trae solo el id). */
  getPayment(paymentId: string): Promise<PagoMP>;
}
