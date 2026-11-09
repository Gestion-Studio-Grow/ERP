// ============================================================================
// Descriptor del módulo TALLER DE STANDS — costos de fabricación y armado (GSG-MIA-004).
// ============================================================================
//
// El taller que fabrica y arma los stands de una productora (MIA y otras) lleva su propia
// administración: catálogo de piezas con costo interno, despiece por stand, horas de mano de obra
// y pedidos de materiales, para saber cuánto le cuesta cada stand contra lo que presupuestó.
// Un stand es un `Proyecto` del módulo `proyectos`; este módulo suma lo propio del taller.
//
// T1: sólo el descriptor, sin pantallas ni tablas. Detrás de TALLER_STANDS_ENABLED (apagado).
// Se asigna SÓLO al rubro `taller-stands` (ADR-055: nunca "todos con todo").
// Sin cruce de datos con la productora: cada negocio ve su base (RLS por tenant). El envío de un
// presupuesto a la productora por link es una tanda aparte y opt-in (decisión del dueño).

import type { ModuleDescriptor } from "../contract";

export const tallerStandsModule: ModuleDescriptor = {
  id: "taller-stands",
  version: "0.1.0",
  nombre: "Taller de stands",
  descripcion:
    "Catálogo de piezas con costo interno, despiece por stand, horas de mano de obra y pedidos de materiales: cuánto cuesta de verdad cada stand.",
  kind: "capability",
  capability: "agenda:read",
  rubros: ["taller-stands"],
  dependencias: [
    { id: "proyectos", rango: "^0.1" },
    { id: "inventario", rango: "^1.0" },
  ],
  flag: "TALLER_STANDS_ENABLED",
  grupo: "ventas-mostrador",
  resumen: "Cada stand con su despiece, sus horas y sus compras: costo presupuestado contra costo real.",
  fit: "Talleres que fabrican y arman stands para productoras y agencias.",
  scopeItems: [
    { label: "Catálogo de piezas con costo interno" },
    { label: "Despiece por stand" },
    { label: "Horas de mano de obra" },
    { label: "Pedidos de materiales que entran como costo del stand" },
  ],
};
