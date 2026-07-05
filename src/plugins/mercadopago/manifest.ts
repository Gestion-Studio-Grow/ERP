/**
 * Manifiesto del plugin Mercado Pago (Integration Engine, ADR-006 / ADR-024).
 * A diferencia de ARCA, no consume eventos del outbox del Core: su entrada es
 * una notificación EXTERNA (webhook de MP). Reusa el mismo formato de manifiesto.
 */

import type { PluginManifest } from "@/plugins/arca/manifest";

export const mercadopagoManifest: PluginManifest = {
  key: "mercadopago",
  nombre: "Mercado Pago — Cobros",
  descripcion:
    "Recibe notificaciones de pago de Mercado Pago; cuando un pago se acredita, auto-factura el turno asociado (ADR-024). No calcula impuestos ni escribe la DB del Core: llama al comando facturarAppointment.",
  // Entrada real: webhook externo de MP (payment.updated). No consume outbox.
  consumeEventos: [],
  llamaComandos: ["facturarAppointment"],
  configSchema: {
    accessToken: {
      tipo: "string",
      secreto: true,
      descripcion: "Access token de Mercado Pago del tenant (cobros).",
    },
    webhookSecret: {
      tipo: "string",
      secreto: true,
      descripcion: "Secreto para validar la firma de los webhooks de MP.",
    },
  },
};
