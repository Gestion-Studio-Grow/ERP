// ============================================================================
// Descriptor del módulo TERMINAL: el mostrador como equipo (lector, ticket térmico, app
// instalable y el perfil de cada equipo).
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §6 T-6. Agrupa lo que depende del EQUIPO
// y no del negocio: cómo lee el lector, de qué ancho sale el ticket, si se imprime solo, si
// suena o vibra. Hoy trae la pantalla «Este equipo» (/admin/ajustes/terminal, app `terminal`
// en src/apps/catalogo/mostrador.ts); el lector en Vender, el ticket 58/80 y la app
// instalable se le cuelgan en las fases T-2/T-4/T-5.
//
// Depende de `pos`: sin mostrador no hay ticket ni lector que configurar. `rubros: "todos"` es
// COMPATIBILIDAD, no asignación (ADR-054/055): ningún negocio lo recibe por defecto ni por
// blueprint; lo asigna el dueño/operador en `Tenant.modules[]`. CH (servicios, sin `pos`) no
// lo ve. Sin migraciones: el perfil vive en el navegador de cada equipo
// (src/lib/terminal/perfil-core.ts). No declara `scopeItems[].ruta`: su pantalla es una app.

import type { ModuleDescriptor } from "../contract";

export const terminalModule: ModuleDescriptor = {
  id: "terminal",
  version: "0.1.0",
  nombre: "Equipos del mostrador",
  descripcion: "Cada equipo con su perfil: lector, ticket de 58 u 80 mm, impresión directa y avisos con sonido o vibración.",
  kind: "capability",
  capability: "orders:manage",
  rubros: "todos",
  dependencias: [{ id: "pos", rango: "^1.0" }],
  grupo: "ventas-mostrador",
  resumen: "La PC de la caja, la tablet de recepción y el celular del mostrador, cada uno configurado para lo que hace.",
  fit: "Comercio con mostrador que usa lector, impresora de tickets o varios equipos (súper, retail, buffet).",
  scopeItems: [
    { label: "Lector de código de barras (prefijo y final)" },
    { label: "Ticket térmico de 58 u 80 mm" },
    { label: "App instalable en la tablet o el celular" },
    { label: "Perfil de cada equipo" },
  ],
};
