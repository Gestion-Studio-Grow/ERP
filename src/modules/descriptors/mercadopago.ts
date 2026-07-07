// ============================================================================
// DESCRIPTOR del módulo Mercado Pago (plugin de cobros) — ADR-024 / ADR-055.
// ============================================================================
//
// A diferencia de ARCA (migrado en su propio dir, src/plugins/arca/module.ts), acá el
// descriptor de MP se declara sin tocar los archivos del plugin: los datos espejan su
// manifiesto (src/plugins/mercadopago/manifest.ts). Cuando MP se reingeniere a "real"
// (Balde B), su descriptor puede mudarse a src/plugins/mercadopago/module.ts como
// fuente de verdad, igual que ARCA — sin cambiar el catálogo (solo el import).
//
// Particularidad: su entrada NO es un evento del outbox del Core sino un webhook
// EXTERNO (payment.updated), por eso `consumeEventos: []`. Sí llama un comando del Core
// (facturarAppointment) al acreditarse un pago.

import type { ModuleDescriptor } from "../contract";

export const mercadopagoModule: ModuleDescriptor = {
  id: "mercadopago",
  version: "0.1.0", // stub; reingeniería a real pendiente (plan-ventana Balde B).
  nombre: "Mercado Pago — Cobros",
  descripcion:
    "Recibe notificaciones de pago de Mercado Pago; al acreditarse un pago, auto-factura el turno asociado (ADR-024). No calcula impuestos ni escribe la DB del Core.",
  kind: "plugin",
  rubros: "todos",
  consumeEventos: [], // entrada real: webhook externo de MP, no el outbox.
  llamaComandos: ["facturarAppointment"],
  configSchema: {
    accessToken: {
      tipo: "string",
      secreto: true,
      requerido: true,
      descripcion: "Access token de Mercado Pago del tenant (cobros).",
    },
    webhookSecret: {
      tipo: "string",
      secreto: true,
      requerido: true,
      descripcion: "Secreto para validar la firma de los webhooks de MP.",
    },
  },
};
