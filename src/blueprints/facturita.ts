// Blueprint "Facturita" — el producto C de la suite de facturación (ADR-076):
// emisor de facturas ARCA self-serve, el empaquetado MÁS LIVIANO del motor.
// Un tenant facturita activa SOLO facturación (arca) + receptores (clients);
// no siembra catálogo ni agenda ni caja: su experiencia vive en /facturita/app
// (Emitir / Mis facturas / Mi cuenta) y el resto del ERP queda apagado por
// asignación de módulos (ADR-054/055), nunca por código distinto.
//
// El gancho comercial: tope de 5 facturas por mes; al superarlo, el upgrade a
// Comerciante es activar más módulos en el MISMO tenant, sin migrar datos.

import type { Blueprint } from "./types";

export const facturitaBlueprint: Blueprint = {
  id: "facturita",
  label: "Facturita",
  description:
    "Emisor de facturas simple y gratuito: emitís tu factura con CAE en tres clics. " +
    "Sin catálogo, sin agenda, sin caja — la puerta de entrada a la suite de facturación.",
  capabilities: ["billing:manage", "clients:manage"],
  brandingDefaults: {
    shortLabel: "Facturita",
    contactNote: "Facturá simple: emitida en tres clics, con validez de ARCA.",
  },
  // Facturita no siembra nada: no hay catálogo que mostrar. Idempotente trivial.
  async seedCatalog() {
    return false;
  },
};
