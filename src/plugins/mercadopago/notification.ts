/**
 * Port de notificación / confirmación por WhatsApp (ADR-025 §12.4).
 * "Te entró $X por MP, ¿lo facturo? sí/no": automatización con control por
 * operación, sin abrir la app. Se conecta con el toggle facturar-sí/no
 * (ADR-024 §2.c) y con el estado REVISAR del clasificador (§12.1).
 *
 * Canal reemplazable detrás del port (WhatsApp hoy; email/push mañana). Stub por
 * ahora (sin proveedor). El flujo es asíncrono: enviar → el comerciante responde
 * sí/no → el webhook del proveedor resuelve la operación (facturar o descartar).
 */

export interface SolicitudConfirmacion {
  tenantId: string;
  /** Pago MP sobre el que se pide confirmación (clave de idempotencia, §3). */
  paymentId: string;
  monto: number;
  /** Destino de la notificación (teléfono WhatsApp del comerciante). */
  destino?: string;
  /** Texto opcional (ej. descripción de la operación). */
  detalle?: string;
}

export interface NotificacionPort {
  /** Envía la consulta de confirmación de facturación al comerciante. */
  pedirConfirmacionFactura(sol: SolicitudConfirmacion): Promise<void>;
}

/** Mensaje que el stub "envió" (para inspección/tests). */
export interface MensajeEnviado extends SolicitudConfirmacion {
  canal: "whatsapp";
  texto: string;
}

/**
 * Stub de WhatsApp: acumula los mensajes en memoria en vez de mandarlos.
 * Permite testear el flujo de confirmación sin proveedor ni red.
 */
export class NotificacionWhatsAppStub implements NotificacionPort {
  readonly enviados: MensajeEnviado[] = [];

  async pedirConfirmacionFactura(sol: SolicitudConfirmacion): Promise<void> {
    this.enviados.push({
      ...sol,
      canal: "whatsapp",
      texto: `Te entró $${sol.monto} por Mercado Pago${sol.detalle ? ` (${sol.detalle})` : ""}. ¿Lo facturo? Respondé SÍ o NO.`,
    });
  }
}
