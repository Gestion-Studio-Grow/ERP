/**
 * MERCADO PAGO — COBROS (links de pago / Checkout Pro). Puerto del módulo.
 *
 * Complementa la INGESTA (../port.ts: getPayment/listPayments, entrada de pagos).
 * Acá está la SALIDA: generar un link de pago (una "preferencia" de Checkout Pro)
 * para mandarle al cliente por WhatsApp y que pague. Mismo patrón hexagonal que el
 * resto: puerto acá, adapter real (http.ts) + stub (stub.ts), sin credenciales en
 * el repo (el token entra por el seam `ProveedorAccessToken`, ADR-025 §9).
 *
 * PURO: solo tipos y el contrato. Nada de red ni Prisma.
 */

/** Estado de una preferencia de cobro recién creada (Checkout Pro). */
export type EstadoPreferencia = "activa" | "error";

/**
 * Solicitud de cobro: lo mínimo para generar un link. Argentinizado — un solo ítem
 * con concepto + monto es lo normal para una pyme (no un carrito completo).
 */
export interface SolicitudCobro {
  /** Qué se cobra (aparece en el checkout). Ej.: "Seña turno — Corte y color". */
  concepto: string;
  /** Monto en pesos (ARS). Debe ser > 0. */
  monto: number;
  /**
   * Referencia externa que ata el cobro a nuestro dominio (ej. `appointmentId` u
   * `orderId`). Vuelve en el webhook de pago → cierra el círculo con la ingesta.
   */
  referenciaExterna?: string;
  /** Cantidad (default 1). Para el raro caso de N unidades del mismo ítem. */
  cantidad?: number;
  /** Email del pagador (pre-carga el checkout; opcional). */
  emailPagador?: string;
}

/** Link de pago generado: lo que se le manda al cliente. */
export interface LinkDePago {
  /** Id de la preferencia en Mercado Pago (idempotencia / seguimiento). */
  preferenceId: string;
  /** URL de pago productiva (la que se comparte por WhatsApp). */
  initPoint: string;
  /** URL de pago de sandbox (para probar sin cobrar de verdad). */
  sandboxInitPoint?: string;
  estado: EstadoPreferencia;
  /** Referencia externa con la que se creó (eco, para atar el seguimiento). */
  referenciaExterna?: string;
}

/**
 * Pasarela de cobros. El adapter real la implementa contra Checkout Pro
 * (`POST /checkout/preferences`); el stub la implementa en memoria (sandbox/dev/test).
 */
export interface PasarelaCobros {
  /** Crea una preferencia de pago y devuelve el link para compartir. */
  crearLinkDePago(solicitud: SolicitudCobro): Promise<LinkDePago>;
}

/** Un problema de validación de la solicitud de cobro (previo a pegarle a MP). */
export interface ErrorSolicitud {
  campo: string;
  mensaje: string;
}

/** La solicitud de cobro no pasó la validación previa (no se llegó a llamar a MP). */
export class SolicitudCobroInvalidaError extends Error {
  constructor(readonly errores: ErrorSolicitud[]) {
    super(`Solicitud de cobro inválida: ${errores.map((e) => `${e.campo}: ${e.mensaje}`).join("; ")}`);
    this.name = "SolicitudCobroInvalidaError";
  }
}

/**
 * Valida una solicitud de cobro (PURO). Evita pegarle a MP con datos inválidos y da
 * mensajes criollos y claros. No lanza: devuelve la lista de problemas (vacía = OK).
 */
export function validarSolicitud(s: SolicitudCobro): ErrorSolicitud[] {
  const errores: ErrorSolicitud[] = [];
  if (!s.concepto?.trim()) {
    errores.push({ campo: "concepto", mensaje: "Poné un concepto (qué estás cobrando)." });
  }
  if (!Number.isFinite(s.monto) || s.monto <= 0) {
    errores.push({ campo: "monto", mensaje: "El monto tiene que ser mayor a cero." });
  }
  if (s.cantidad !== undefined && (!Number.isInteger(s.cantidad) || s.cantidad < 1)) {
    errores.push({ campo: "cantidad", mensaje: "La cantidad tiene que ser un entero de 1 o más." });
  }
  if (s.emailPagador !== undefined && s.emailPagador !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.emailPagador)) {
    errores.push({ campo: "emailPagador", mensaje: "El email del pagador no es válido." });
  }
  return errores;
}
