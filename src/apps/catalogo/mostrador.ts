// ============================================================================
// CATÁLOGO DE APPS — Mostrador (vender, pedidos, ventas del día).
// ============================================================================
//
// En la ola 1 sólo está Pedidos, que es la pantalla que existe hoy. Vender (/admin/vender)
// y Ventas del día (/admin/ventas) las suma el frente de mostrador de la ola 2 acá mismo.
// Su lugar dentro del espacio ya está decidido en src/apps/espacios.ts.

import type { AppDescriptor } from "../contract";

export const APPS_MOSTRADOR = [
  {
    id: "pedidos",
    nombre: "Pedidos para preparar",
    descripcion: "Los pedidos abiertos: preparar, entregar y cobrar.",
    icono: "pedidos",
    ruta: "/admin/pedidos",
    espacio: "mostrador",
    capability: "orders:read",
    modulo: "pos",
    estado: "lista",
    kpi: {
      id: "pedidos",
      mide: "Pedidos para preparar, los de hoy, los entregados sin cobrar y los links sin pagar.",
    },
    palabras: ["ventas", "mostrador", "comandas"],
    menuDeHoy: { etiqueta: "Pedidos", orden: 50 },
  },
] as const satisfies readonly AppDescriptor[];
