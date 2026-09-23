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
    kpi: {
      id: "facturacion",
      mide: "Comprobantes del mes, cuántos rechazó ARCA y las ventas anuladas con factura sin nota de crédito.",
    },
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
  // CIERRE DEL MES: del núcleo, como la caja. Todo negocio que maneja plata cierra el mes
  // para su contador, tenga o no facturación electrónica. Pide reports:read (sólo la dueña):
  // congelar el mes y bajar el paquete es trabajo de ella, y el paquete lleva todos los
  // montos. Reabrir además exige OWNER explícito (cierre-mes/cierre-mes.ts). No estaba en la
  // barra de hoy: no lleva `menuDeHoy`, así que CH no ve un cambio en su menú.
  {
    id: "cierre-del-mes",
    nombre: "Cierre del mes",
    descripcion: "Revisar el mes, congelarlo y bajar el paquete para tu contador.",
    // El del cierre del día: es el mismo gesto, un mes entero. El candado ya es de "App no
    // disponible" y en el Inicio se leería como "bloqueada".
    icono: "cierre",
    ruta: "/admin/cierre-mes",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: null,
    estado: "lista",
    kpi: {
      id: "cierre-del-mes",
      mide: "Si el mes anterior está congelado, cuántos pasos quedaron listos y quién bajó el paquete.",
    },
    palabras: ["cerrar el mes", "fin de mes", "paquete", "contadora", "contador", "congelar el mes", "exportar al contador"],
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
    kpi: {
      id: "reportes",
      mide: "Lo cobrado en el período por defecto de Reportes (90 días), igual que la pantalla: los turnos o, en un local de mostrador, las ventas.",
      capability: "reports:read",
    },
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
    // Declarado SIN loader todavía (queda en SIN_LOADER_TODAVIA de loaders.test): el saldo de
    // cada deuda es su total menos sus pagos, que viven en otra tabla sin relación. Son dos
    // lecturas y la regla 8 pide una; ver el encabezado de kpis/finanzas.server.ts.
    kpi: { id: "cuentas-a-pagar", mide: "Lo que vence en 7 días, los cheques a debitar y, en alerta, lo vencido.", capability: "reports:read" },
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
    // Declarado SIN loader todavía, por lo mismo que Cuentas a pagar.
    kpi: { id: "cuentas-a-cobrar", mide: "Lo que te deben y cuánto es fiado de hace más de 30 días.", capability: "reports:read" },
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
    kpi: {
      id: "libro-iva",
      mide: "IVA del mes a pagar, sólo de comprobantes con CAE (sólo si el negocio emite A o B).",
      capability: "reports:read",
      // El número entero es plata, y el loader lo calcula sólo si le llega `monto`: sin esta
      // parte declarada `partesDelKpi` le pasaba siempre false y el botón no mostraba nunca el
      // IVA del mes (medido: `libroIva` devolvía null para la dueña).
      monto: { mide: "El IVA del mes a pagar o a favor.", capability: "reports:read" },
    },
    menuDeHoy: { etiqueta: "Libros", orden: 270, moduloDeHoy: null },
  },
  // ── FINANZAS DE GESTIÓN (ola 3) ─────────────────────────────────────────────
  //
  // Apps nuevas: no estaban en la barra de hoy, así que no llevan `menuDeHoy` y CH (sin
  // gate) no ve un cambio en su menú ni en su Inicio. Todas son plata del negocio: piden
  // reports:read (sólo la dueña o el dueño) y su número también.
  //
  // Margen, Resultado y Flujo cuelgan de `reports`, que es núcleo del comerciante y de la
  // pyme (nativos.ts): el tablero de plata viene con el negocio. Retenciones cuelga de
  // `bancos`: sin extracto importado no hay de dónde leerlas (igual que Facturación
  // automática).
  //
  // Comisiones cuelga de `reports` y del rubro servicios, NO de `commissions`: hoy las
  // comisiones se ven y se liquidan dentro de Reportes (módulo `reports`), y sacarlas a una app
  // propia no puede cambiar quién las ve. Además `commissions` no se puede asignar a un negocio
  // sin blueprint (CH: el módulo es del rubro servicios y sin blueprint el rubro no se sabe;
  // medido con `planFijarAsignacion`): colgada de él, CH la perdería el día que pase al Inicio
  // por apps. La liquidación sigue pidiendo commissions:manage (el rol), como siempre.
  {
    id: "margen",
    nombre: "Margen",
    descripcion: "Cuánto te deja cada producto, con el costo de cada venta.",
    icono: "reportes",
    ruta: "/admin/reportes/margen",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "reports",
    estado: "lista",
    kpi: {
      id: "margen",
      mide: "Productos con el precio de lista por debajo del costo vigente: pierden plata en cualquier condición fiscal.",
      capability: "reports:read",
    },
    palabras: ["rentabilidad", "ganancia por producto", "costo", "vendo a perdida", "por debajo del costo", "cuanto deja"],
  },
  {
    id: "resultado-del-mes",
    nombre: "Resultado del mes",
    descripcion: "Cuánto dejó el mes: ventas menos lo que costó lo vendido y los gastos.",
    icono: "contabilidad",
    ruta: "/admin/resultado",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "reports",
    estado: "lista",
    // SIN número en el Inicio: "agosto dejó $X" cruza ventas, costo de lo vendido y gastos
    // (seis tablas) y la regla 8 de la arquitectura pide UNA operación por número. Darle número
    // es una excepción que decide plataforma, con la latencia contra Neon medida; el loader
    // saldría de la misma lectura de la pantalla (reports/resultado-lectura.ts).
    palabras: ["ganancia", "cuanto gane", "estado de resultados", "rentabilidad del mes", "gastos", "utilidad"],
  },
  {
    id: "flujo-de-fondos",
    nombre: "Flujo de fondos",
    descripcion: "La plata de hoy, lo que entra y lo que sale, semana por semana.",
    icono: "caja",
    ruta: "/admin/flujo",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "reports",
    estado: "lista",
    kpi: {
      id: "flujo-de-fondos",
      // La plata de hoy y no la de 30 días: la proyección cruza libro, fiado y deudas (cinco
      // lecturas) y la regla 8 pide una operación por número. Es la primera tarjeta de la
      // pantalla, con la misma consulta.
      mide: "La plata de hoy según el libro de caja, de donde arranca la proyección; en alerta, si está en negativo.",
      capability: "reports:read",
    },
    palabras: ["cash flow", "me alcanza", "cheques", "proyeccion", "vencimientos", "plata a futuro"],
  },
  {
    id: "retenciones-y-percepciones",
    nombre: "Retenciones y percepciones",
    descripcion: "Los impuestos que el banco ya te descontó, para tomarlos a cuenta.",
    icono: "bancos",
    ruta: "/admin/retenciones",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "bancos",
    estado: "lista",
    kpi: {
      id: "retenciones-y-percepciones",
      mide: "Retenciones y percepciones del mes descontadas por el banco (Ingresos Brutos, IVA, Ganancias); el impuesto al cheque, aparte.",
      capability: "reports:read",
    },
    palabras: ["sircreb", "iibb", "ingresos brutos", "impuesto al cheque", "percepciones", "retenciones", "pagos a cuenta"],
  },
  {
    id: "comisiones",
    nombre: "Comisiones",
    descripcion: "Lo que le toca a cada profesional y su liquidación.",
    icono: "usuarios",
    ruta: "/admin/comisiones",
    espacio: "finanzas",
    capability: "reports:read",
    modulo: "reports",
    rubro: "servicios",
    estado: "lista",
    kpi: { id: "comisiones", mide: "Lo que falta liquidar y a cuántos profesionales.", capability: "reports:read" },
    palabras: ["liquidar", "liquidacion", "profesionales", "porcentaje", "pagar comision"],
  },
] as const satisfies readonly AppDescriptor[];
