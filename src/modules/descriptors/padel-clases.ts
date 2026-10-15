// ============================================================================
// Descriptor del módulo PADEL-CLASES — el turnero y la agenda de un profe de pádel (ADR-054/055).
// ============================================================================
//
// Turnero público para la bio de Instagram, el profe confirma con un toque, el alumno tiene
// su link para repetir la clase de la semana que viene y mandar el comprobante, y los avisos
// salen por WhatsApp (link wa.me hoy; Cloud API de Meta cuando el dueño cargue credenciales).
//
// kind: "capability" (módulo nativo: src/lib/padel + src/app/admin/(dashboard)/clases).
// Se asigna SÓLO a negocios del rubro `profe-padel` (ADR-055: nunca "todos con todo").

import type { ModuleDescriptor } from "../contract";

export const padelClasesModule: ModuleDescriptor = {
  id: "padel-clases",
  version: "0.1.0",
  nombre: "Clases de pádel",
  descripcion:
    "Turnero público para la bio de Instagram, confirmación del profe con un toque, link del alumno para repetir la clase y mandar el comprobante, y avisos por WhatsApp.",
  kind: "capability",
  capability: "agenda:read",
  rubros: "todos",
  dependencias: [{ id: "clients", rango: "^1.0" }],
  grupo: "ventas-mostrador",
  resumen: "La agenda del profe en el celular: quién pidió, a quién confirmar, quién pagó y la próxima clase, entre clase y clase.",
  fit: "Profesores y entrenadores particulares que dan clases solos (pádel, tenis, entrenamiento).",
  scopeItems: [
    { label: "Turnero público de 3 pasos para la bio de Instagram" },
    { label: "Confirmar o rechazar el pedido con un toque" },
    { label: "Link del alumno: repetir la clase y mandar el comprobante" },
    { label: "Cobro en efectivo o validación del comprobante en un toque" },
    { label: "Avisos por WhatsApp (link hoy, Cloud API lista para enchufar)" },
  ],
  migraciones: [
    {
      carpeta: "prisma/migrations/20261015120000_modulo_padel_clases",
      descripcion: "Tablas del profe (configuración, franjas, alumnos, clases y avisos) con RLS.",
      aditiva: true,
    },
  ],
};
