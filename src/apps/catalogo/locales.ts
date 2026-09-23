// ============================================================================
// CATÁLOGO DE APPS — Mis locales (marca con varios locales).
// ============================================================================
//
// Las apps de la casa de una marca con varios locales: la dueña ve en un tablero las ventas,
// las cajas y el stock de todos sus locales, sin entrar a cada backoffice. Cada local sigue
// siendo un negocio con sus datos separados; la casa sólo LEE los locales que GSG le vinculó
// desde su consola (src/lib/operador/red-locales-actions.ts).
//
// Toda app de este archivo lee datos de OTRO negocio: lleva `moduloDuro: true` (exige el
// módulo `multilocal` aun con el gate apagado, así que CH y cualquier negocio suelto no las
// ven ni tecleando la URL) y su página y sus actions llaman a `exigirCasa()`. Esconderla no
// alcanza; un test del registro lo exige.
//
// CAPABILITY: Mis locales, Ventas y Cajas son de la dueña (`multilocal:manage`: sólo OWNER).
// Stock por local la abre también el encargado de la casa (RECEPTION con `stock:read`): es la
// pantalla desde donde se decide qué mandar a cada local, y no muestra plata.
//
// NÚMEROS: los calcula src/apps/kpis/locales.server.ts con UNA pasada por local, compartida
// por las cuatro apps en el mismo request. La plata va declarada aparte, con reports:read.
//
// Ninguna lleva `menuDeHoy`: no estaban en la barra de hoy (la de CH no cambia).

import type { AppDescriptor } from "../contract";

export const APPS_LOCALES = [
  {
    id: "mis-locales",
    nombre: "Mis locales",
    descripcion: "Cómo viene hoy cada local: lo cobrado, la caja y el stock bajo, sin entrar a cada uno.",
    icono: "localizacion",
    ruta: "/admin/locales",
    espacio: "locales",
    capability: "multilocal:manage",
    modulo: "multilocal",
    moduloDuro: true,
    estado: "lista",
    kpi: {
      id: "mis-locales",
      mide: "Locales de la red y cuántos tienen la caja sin cerrar de días anteriores.",
      monto: { mide: "Lo cobrado hoy en todos los locales, menos lo anulado hoy.", capability: "reports:read" },
    },
    palabras: ["locales", "sucursales", "red", "marca", "tablero"],
  },
  {
    id: "ventas-por-local",
    nombre: "Ventas por local",
    descripcion: "Lo cobrado en cada local por día y por medio de cobro, con el archivo para la contadora.",
    icono: "reportes",
    ruta: "/admin/locales/ventas",
    espacio: "locales",
    capability: "multilocal:manage",
    modulo: "multilocal",
    moduloDuro: true,
    estado: "lista",
    kpi: {
      id: "ventas-por-local",
      mide: "Lo cobrado esta semana en la red y el local que más cambió frente a la semana anterior.",
      capability: "reports:read",
    },
    palabras: ["ventas", "comparar locales", "csv", "contadora", "consolidado", "cuit"],
  },
  {
    id: "cajas-de-los-locales",
    nombre: "Cajas de los locales",
    descripcion: "Qué local no cerró la caja, desde qué día, y qué diferencia dejó cada cierre.",
    icono: "cierre",
    ruta: "/admin/locales/cajas",
    espacio: "locales",
    capability: "multilocal:manage",
    modulo: "multilocal",
    moduloDuro: true,
    estado: "lista",
    kpi: { id: "cajas-de-los-locales", mide: "Locales con la caja sin cerrar de días anteriores." },
    palabras: ["cierres", "arqueo", "diferencias", "faltante", "sobrante"],
  },
  {
    id: "stock-por-local",
    nombre: "Stock por local",
    descripcion: "Cada producto en la casa y en todos los locales: dónde sobra y dónde falta.",
    icono: "inventario",
    ruta: "/admin/locales/stock",
    espacio: "locales",
    capability: "stock:read",
    modulo: "multilocal",
    moduloDuro: true,
    rubro: "mostrador",
    estado: "lista",
    kpi: { id: "stock-por-local", mide: "Productos bajo el mínimo en los locales, y en cuántos locales." },
    palabras: ["stock", "existencias", "reponer", "faltantes"],
  },
] as const satisfies readonly AppDescriptor[];
