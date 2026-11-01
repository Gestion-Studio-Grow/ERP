// ============================================================================
// Descriptor del módulo PROYECTOS — el trabajo de una productora (ADR-054/055).
// ============================================================================
//
// Cada trabajo (evento, activación, stand, escenografía, contenido) con sus etapas, tareas,
// archivos, presupuesto por versiones con costo y margen, propuesta que el cliente aprueba desde
// un link, cobros que entran a la caja y armador de stands en 3D.
//
// kind: "capability" (módulo nativo: src/lib/proyectos + src/app/admin/(dashboard)/proyectos).
// Se asigna SÓLO a negocios del rubro `productora` (ADR-055: nunca "todos con todo").

import type { ModuleDescriptor } from "../contract";

export const proyectosModule: ModuleDescriptor = {
  id: "proyectos",
  version: "0.1.0",
  nombre: "Proyectos y propuestas",
  descripcion:
    "Trabajos por etapas, tareas y archivos, presupuesto con costo y margen, propuesta que el cliente aprueba desde un link, cobros y armador de stands en 3D.",
  kind: "capability",
  capability: "agenda:read",
  rubros: "todos",
  dependencias: [{ id: "clients", rango: "^1.0" }],
  grupo: "ventas-mostrador",
  resumen: "Cada trabajo en un solo lugar: del pedido del cliente al desarme, con su plata y sus renders.",
  fit: "Productoras de eventos, agencias de activaciones y empresas de stands.",
  scopeItems: [
    { label: "Tablero de proyectos por etapa" },
    { label: "Presupuesto por versiones con costo y margen" },
    { label: "Propuesta con renders que el cliente aprueba desde un link" },
    { label: "Armador de stands en 3D con cómputo de materiales" },
    { label: "Cobros que entran a la caja" },
  ],
  migraciones: [
    {
      carpeta: "prisma/migrations/20261101120000_modulo_proyectos",
      descripcion: "Tablas de proyectos (proyecto, tareas, presupuestos, ítems, cobros, archivos, stands, configuración) con RLS.",
      aditiva: true,
    },
  ],
};
