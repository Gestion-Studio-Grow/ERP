// ============================================================================
// CATÁLOGO DE APPS — Caja y Finanzas.
// ============================================================================
//
// CAJA, LIBRO Y CIERRE SON DEL NÚCLEO (`modulo: null`). El descriptor de `pos` también
// reclama /admin/caja (nativos.ts:48), pero el preset de servicios no trae `pos`
// (presets-meta.ts: "SIN pos (no es mostrador)"): si la caja colgara de `pos`, el día que
// CH entre al gate perdería las tres pantallas con las que se le reemplazó la planilla.
// Todo negocio que maneja plata tiene caja; el turno de cajero es una sección de esta app.
//
// FACTURACIÓN AUTOMÁTICA ES UNA APP PROPIA con el módulo `bancos`. Hasta ahora la cubría
// el prefijo de /admin/facturacion (módulo `arca`), y los dos descriptores reclamaban la
// misma ruta. Por segmento, /admin/facturacion/bancos ya no cae en Facturación
// (src/apps/rutas.ts). No figura en la barra de hoy: se llega desde Facturación.
//
// LAS PANTALLAS DE EDICIÓN (Libro IVA, Fiado, Cuentas a pagar) llevan su `perfilMin` de
// ENTERPRISE_NAV_ITEMS y además su módulo, que el menú de hoy no les pone (nav-groups.ts,
// comentario corregido). Con el gate apagado el módulo no decide nada; en el Comerciante
// tampoco, porque su barra de hoy no las filtra por módulo (`moduloDeHoy: null`); en los
// negocios del piloto decide el módulo, no el perfil.
// No llevan `palabras` porque hoy no tienen alias: con el motor de perfiles prendido el
// buscador de la barra encontraría cosas que hoy no encuentra, y la paridad es exacta.

import type { AppDescriptor } from "../contract";

export const APPS_FINANZAS = [
  {
    id: "caja-del-dia",
    nombre: "Caja del día",
    descripcion: "Qué entró hoy por cada medio, y los gastos y retiros.",
    icono: "caja",
    ruta: "/admin/caja",
    espacio: "caja",
    capability: "orders:read",
    modulo: null,
    estado: "lista",
    kpi: {
      id: "caja-del-dia",
      mide: "Si la caja está abierta y desde qué hora.",
      monto: { mide: "El efectivo que tendría que haber en el cajón.", capability: "reports:read" },
    },
    palabras: ["mostrador", "cobrar", "caja de hoy", "efectivo del dia", "fondo inicial", "contar el cajon", "relevo", "gasto", "retiro"],
    menuDeHoy: { etiqueta: "Caja", orden: 60 },
  },
  {
    id: "libro-de-caja",
    nombre: "Libro de caja",
    descripcion: "El mes completo por medio de pago, listo para la contadora.",
    icono: "contabilidad",
    ruta: "/admin/caja/libro",
    espacio: "caja",
    capability: "orders:read",
    modulo: null,
    estado: "lista",
    kpi: {
      id: "libro-de-caja",
      mide: "Movimientos del mes que parecen duplicados.",
      monto: { mide: "El saldo del mes.", capability: "reports:read" },
    },
    palabras: ["planilla", "excel", "google sheets", "caja diaria", "ingresos y egresos", "mensual", "saldo"],
    menuDeHoy: { etiqueta: "Libro de caja", orden: 70 },
  },
  {
    id: "cierre-del-dia",
    nombre: "Cierre del día",
    descripcion: "Contar la plata, cerrar el día y anotar la diferencia.",
    icono: "cierre",
    ruta: "/admin/caja/cierre",
    espacio: "caja",
    capability: "orders:read",
    modulo: null,
    estado: "lista",
    kpi: {
      id: "cierre-del-dia",
      mide: "Días sin cerrar.",
      monto: { mide: "La diferencia del último cierre (faltante o sobrante).", capability: "reports:read" },
    },
    palabras: ["cerrar la caja", "cierre de caja", "arqueo", "arqueo del día", "contar la plata", "diferencia de caja", "cuadrar"],
    menuDeHoy: { etiqueta: "Cierre del día", orden: 80 },
  },
  {
    id: "facturacion",
    nombre: "Facturación",
    descripcion: "Facturas electrónicas y links de cobro.",
    icono: "facturacion",
    ruta: "/admin/facturacion",
    espacio: "finanzas",
    capability: "billing:manage",
    modulo: "arca",
    estado: "lista",
    kpi: { id: "facturacion", mide: "Comprobantes del mes y cuántos rechazó ARCA." },
    palabras: ["arca", "afip", "comprobantes", "iva", "factura"],
    menuDeHoy: { etiqueta: "Facturación", orden: 170 },
  },
  {
    id: "facturacion-automatica",
    nombre: "Facturación automática",
    descripcion: "Subís el extracto del banco y las facturas se arman solas.",
    icono: "bancos",
    ruta: "/admin/facturacion/bancos",
    espacio: "finanzas",
    capability: "billing:manage",
    modulo: "bancos",
    estado: "lista",
    kpi: {
      id: "facturacion-automatica",
      mide: "Ventas del extracto listas para emitir y las que esperan datos del comprador.",
    },
    palabras: ["extracto", "banco", "facturar solo", "acreditaciones"],
  },
  {
    id: "reportes",
    nombre: "Reportes",
    descripcion: "Ingresos, ventas y rendimiento del negocio.",
    icono: "reportes",
    ruta: "/admin/reportes",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "reports",
    estado: "lista",
    kpi: { id: "reportes", mide: "Ingresos cobrados en turnos en el período por defecto de Reportes (90 días), igual que la pantalla.", capability: "reports:read" },
    palabras: ["informes", "estadisticas", "rentabilidad", "comisiones", "ingresos"],
    menuDeHoy: { etiqueta: "Reportes", orden: 180 },
  },
  {
    id: "cuentas-a-pagar",
    nombre: "Cuentas a pagar",
    descripcion: "Lo que le debés a cada proveedor y cuándo vence.",
    icono: "cuentas-a-pagar",
    ruta: "/admin/cuentas-a-pagar",
    espacio: "finanzas",
    capability: "billing:manage",
    modulo: "cuentas-a-pagar",
    perfilMin: "enterprise",
    estado: "lista",
    kpi: { id: "cuentas-a-pagar", mide: "Lo que vence en 7 días y los cheques a debitar.", capability: "reports:read" },
    menuDeHoy: { etiqueta: "Cuentas a pagar", orden: 250, moduloDeHoy: null },
  },
  {
    id: "cuentas-a-cobrar",
    nombre: "Fiado y cuentas de clientes",
    descripcion: "Quién te debe, cuánto y desde cuándo.",
    // Mismo ícono que Caja: es el que usa la barra de hoy.
    icono: "caja",
    ruta: "/admin/cuentas-a-cobrar",
    espacio: "finanzas",
    capability: "billing:manage",
    modulo: "cuentas-a-cobrar",
    perfilMin: "lite",
    estado: "lista",
    kpi: { id: "cuentas-a-cobrar", mide: "Lo que te deben y cuánto tiene más de 30 días.", capability: "reports:read" },
    menuDeHoy: { etiqueta: "Cuentas a cobrar", orden: 260, moduloDeHoy: null },
  },
  {
    id: "libro-iva",
    nombre: "Libro IVA",
    descripcion: "El IVA de ventas y compras del mes, para el contador.",
    icono: "contabilidad",
    ruta: "/admin/libros",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "libros",
    perfilMin: "enterprise",
    estado: "lista",
    kpi: { id: "libro-iva", mide: "IVA del mes a pagar (sólo Responsable Inscripto).", capability: "reports:read" },
    menuDeHoy: { etiqueta: "Libros", orden: 270, moduloDeHoy: null },
  },
] as const satisfies readonly AppDescriptor[];
