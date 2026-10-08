// ============================================================================
// Descriptor del módulo TALLER — el circuito de un taller mecánico (ADR-054/055).
// ============================================================================
//
// Vehículos por patente, orden de trabajo con sus siete estados, presupuesto que el cliente
// aprueba ítem por ítem desde un link, seguimiento público sin login, cobros con seña y
// recargo por cuotas, y avisos para que el cliente vuelva (service, VTV, inactivos).
//
// kind: "capability" (módulo nativo: src/lib/taller + src/app/admin/(dashboard)/taller).
// Se asigna SÓLO a negocios del rubro `taller` (ADR-055: nunca "todos con todo").

import type { ModuleDescriptor } from "../contract";

export const tallerModule: ModuleDescriptor = {
  id: "taller",
  version: "0.1.0",
  nombre: "Taller mecánico",
  descripcion:
    "Órdenes de trabajo por patente, presupuesto con aprobación del cliente desde un link, seguimiento público del auto, cobros con seña y avisos de service y VTV por WhatsApp.",
  kind: "capability",
  capability: "agenda:read",
  rubros: "todos",
  dependencias: [{ id: "clients", rango: "^1.0" }],
  grupo: "ventas-mostrador",
  resumen: "El cuaderno del taller, en el celular: qué auto entró, qué se le hace, cuánto sale y cuándo avisarle al dueño.",
  fit: "Talleres mecánicos, lubricentros y gomerías de 1 a 6 personas.",
  scopeItems: [
    { label: "Tablero del día por estado" },
    { label: "Ingreso del auto en un minuto" },
    { label: "Presupuesto que el cliente aprueba desde un link" },
    { label: "Seguimiento público sin login" },
    { label: "Avisos de service, VTV y clientes que no vuelven" },
  ],
  migraciones: [
    {
      carpeta: "prisma/migrations/20261008120000_modulo_taller",
      descripcion: "Tablas del taller (vehículo, orden, ítems, fotos, pagos, configuración, avisos) con RLS.",
      aditiva: true,
    },
  ],
};
