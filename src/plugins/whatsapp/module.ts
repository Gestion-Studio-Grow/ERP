// Descriptor del módulo WhatsApp (plugin de mensajería) para el catálogo (ADR-054/055).
// DATO PURO: lo importa src/modules/catalog.ts, que puede llegar al cliente. El conector de la
// suite E3 (con la firma, en node:crypto) vive en ./conector.ts y reusa este descriptor.

import type { ModuleDescriptor } from "@/modules/contract";

export const whatsappModule: ModuleDescriptor = {
  id: "whatsapp",
  version: "0.1.0",
  nombre: "WhatsApp — Mensajes",
  descripcion:
    "Recibe los mensajes y los estados de entrega del número de WhatsApp Business del negocio (Cloud API de Meta).",
  kind: "plugin",
  rubros: "todos",
  consumeEventos: [],
};
