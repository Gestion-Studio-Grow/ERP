// ============================================================================
// CATÁLOGO DE APPS — Mostrador (vender, pedidos, ventas del día).
// ============================================================================
//
// Vender (/admin/vender) y Ventas del día (/admin/ventas) llegan en la ola 2. Ninguna de las
// dos lleva `menuDeHoy`: no estaban en la barra de hoy, así que la barra de CH no cambia (lo
// prueba el test de paridad). Se ofrecen en el Inicio por apps y en el buscador; en CH, el POS
// sigue siendo la solapa de /admin/pedidos hasta que el dueño apruebe el modelo nuevo.
// Su lugar dentro del espacio ya está decidido en src/apps/espacios.ts.

import type { AppDescriptor } from "../contract";

export const APPS_MOSTRADOR = [
  {
    id: "vender",
    nombre: "Vender",
    descripcion: "Cobrar en el mostrador, por kilo o por unidad, con vuelto, descuento y ticket.",
    icono: "vender",
    ruta: "/admin/vender",
    espacio: "mostrador",
    // Vender CREA ventas: la misma capability que `createOrder`.
    capability: "orders:manage",
    modulo: "pos",
    // CH no la ve ni por URL: trae plata NUEVA al mostrador (descuento, precio a mano, anular
    // desde otra pantalla) y CH está viva y sin gate. Exigir el módulo siempre la deja sólo para
    // los negocios con `pos` asignado (MAGRA y los comercios); beauty-spa tiene la asignación
    // vacía hasta que el dueño apruebe pasarla al modelo por apps.
    moduloDuro: true,
    estado: "lista",
    kpi: {
      id: "vender",
      // Cuenta por el día en que se TOMÓ la venta (`whereVentasCobradas`, createdAt), como pide
      // el brief: un pedido de ayer cobrado hoy no suma hoy. Contarlo por el día del asiento
      // (como Caja del día) cambia un `where` compartido con Mermas y con loaders.test.ts.
      mide: "Ventas tomadas hoy y ya cobradas",
      monto: { mide: "Lo cobrado de las ventas tomadas hoy", capability: "reports:read" },
    },
    palabras: ["cobrar", "venta", "mostrador", "ticket", "vuelto", "descuento", "pos"],
  },
  {
    id: "pedidos",
    nombre: "Pedidos para preparar",
    descripcion: "Los pedidos abiertos: preparar, pesar, avisar, entregar y cobrar.",
    icono: "pedidos",
    ruta: "/admin/pedidos",
    espacio: "mostrador",
    capability: "orders:read",
    modulo: "pos",
    estado: "lista",
    kpi: {
      id: "pedidos",
      mide: "Pedidos para preparar, los de hoy y los entregados sin cobrar.",
    },
    palabras: ["ventas", "mostrador", "comandas"],
    menuDeHoy: { etiqueta: "Pedidos", orden: 50 },
  },
  {
    id: "ventas-del-dia",
    nombre: "Ventas del día",
    descripcion: "Las ventas cobradas: anular con motivo o reenviar el ticket.",
    icono: "ventas",
    ruta: "/admin/ventas",
    espacio: "mostrador",
    // Ver la lista alcanza con orders:read; anular pide además orders:void (lo decide la
    // pantalla para ofrecer el botón y `anularVenta` para hacerlo).
    capability: "orders:read",
    modulo: "pos",
    // CH no la ve ni por URL: trae plata NUEVA al mostrador (descuento, precio a mano, anular
    // desde otra pantalla) y CH está viva y sin gate. Exigir el módulo siempre la deja sólo para
    // los negocios con `pos` asignado (MAGRA y los comercios); beauty-spa tiene la asignación
    // vacía hasta que el dueño apruebe pasarla al modelo por apps.
    moduloDuro: true,
    estado: "lista",
    kpi: {
      id: "ventas-del-dia",
      mide: "Las anulaciones de hoy y quién las hizo.",
      monto: { mide: "Lo anulado hoy.", capability: "reports:read" },
    },
    palabras: ["anular", "anulaciones", "tickets", "ventas de hoy", "corregir una venta", "reenviar ticket"],
  },
] as const satisfies readonly AppDescriptor[];
