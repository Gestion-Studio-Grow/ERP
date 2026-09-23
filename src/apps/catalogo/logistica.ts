// ============================================================================
// CATÁLOGO DE APPS — Stock y compras (frente de logística).
// ============================================================================
//
// MÓDULO: todo lo de stock cuelga de `inventario` (src/modules/descriptors/nativos.ts),
// que depende de `catalog`. En el menú de hoy estas pantallas figuraban con `catalog`, y
// /admin/inventario estaba declarada tres veces con tres verdades distintas (catalog +
// catalog:read en ALL_ITEMS, catalog:manage en ENTERPRISE_NAV_ITEMS y el módulo
// `inventario` en su descriptor). Queda una.
// Con el gate apagado (CH y todo negocio fuera del piloto) el módulo no decide nada, así
// que nadie pierde una pantalla. El Comerciante, que ya tenía gate, las sigue filtrando
// con `catalog` como hoy (`menuDeHoy.moduloDeHoy`): su barra no cambia. Para los negocios
// del piloto, el operador asigna `inventario` a magra, shinevelas y adosmanos ANTES de
// prenderles el Inicio por apps.
//
// CAPABILITY: la que decide quién ABRE la app (la aplica `requireApp` en la página y
// `requireAppAccion` en sus acciones). Las apps que ya estaban en la barra conservan la de hoy
// (catalog:read): cambiarla a una capability de stock le sumaría Compras y Ajustes a la
// recepción de CH, que es de servicios y no las ve. Adentro, cada operación pide además su
// capability fina (stock:read, stock:receive, stock:count, stock:adjust, purchasing:manage) y
// los costos piden costs:read. Las apps NUEVAS de la ola 2 que son de mostrador (Movimientos y
// Recuento) usan directo la capability de stock: el rubro ya las deja fuera de CH, y así el
// encargado (RECEPTION) de un mostrador las abre. Stock, Recibir mercadería y Mermas suman
// `capabilityEnMostrador`: en un local de mostrador del piloto las abre el encargado con su
// permiso de stock (sin costos, y la merma con tope); en CH (contexto null) no cuenta.
//
// RUBRO: se conserva el de hoy, aunque el catálogo de producto pida más. Mermas y Recibir
// mercadería no llevan rubro porque CH las ve hoy en su barra, y CH no cambia.

import type { AppDescriptor } from "../contract";

export const APPS_LOGISTICA = [
  {
    id: "inventario",
    nombre: "Stock",
    descripcion: "Cuánto hay de cada producto y cuánto vale.",
    icono: "inventario",
    ruta: "/admin/inventario",
    espacio: "stock",
    capability: "catalog:read",
    capabilityEnMostrador: "stock:read",
    modulo: "inventario",
    rubro: "mostrador",
    estado: "lista",
    kpi: {
      id: "inventario",
      mide: "Productos bajo el mínimo y productos con stock sin costo.",
      monto: { mide: "El stock valorizado a costo vigente.", capability: "reports:read" },
    },
    palabras: ["stock", "existencias"],
    menuDeHoy: { etiqueta: "Inventario", orden: 110, moduloDeHoy: "catalog" },
  },
  {
    id: "movimientos",
    nombre: "Movimientos de un producto",
    descripcion: "Por qué el stock dice lo que dice: cada entrada y salida con su saldo.",
    icono: "inventario",
    ruta: "/admin/inventario/movimientos",
    espacio: "stock",
    capability: "stock:read",
    modulo: "inventario",
    rubro: "mostrador",
    estado: "lista",
    kpi: { id: "movimientos", mide: "Productos en negativo que hay que recontar." },
    palabras: ["historial de stock", "entradas y salidas", "negativos", "saldo"],
  },
  {
    id: "recuento",
    nombre: "Recuento",
    descripcion: "Contar la góndola con el local abierto, sin que la venta del momento ensucie la diferencia.",
    icono: "ajustes",
    ruta: "/admin/ajustes/recuento",
    espacio: "stock",
    capability: "stock:count",
    modulo: "inventario",
    rubro: "mostrador",
    estado: "lista",
    kpi: { id: "recuento", mide: "Productos sin contar hace más de 30 días." },
    palabras: ["contar", "conteo", "planilla", "inventario fisico"],
  },
  {
    id: "recibir-mercaderia",
    nombre: "Recibir mercadería",
    descripcion: "Cargar lo que llegó del proveedor, con su costo.",
    icono: "compras",
    ruta: "/admin/compras",
    espacio: "stock",
    capability: "catalog:read",
    capabilityEnMostrador: "stock:receive",
    modulo: "inventario",
    estado: "lista",
    kpi: {
      id: "recibir-mercaderia",
      mide: "Recepciones del mes y cuántas quedaron sin proveedor.",
      monto: { mide: "Lo comprado en el mes.", capability: "reports:read" },
    },
    palabras: ["proveedores", "reposicion", "remitos"],
    menuDeHoy: { etiqueta: "Compras", orden: 100, moduloDeHoy: "catalog" },
  },
  {
    id: "mermas",
    nombre: "Mermas",
    descripcion: "Lo que se rompió, venció o faltó en el recuento.",
    icono: "ajustes",
    ruta: "/admin/ajustes",
    espacio: "stock",
    capability: "catalog:read",
    capabilityEnMostrador: "stock:adjust",
    modulo: "inventario",
    estado: "lista",
    kpi: {
      id: "mermas",
      mide: "Mermas cargadas este mes, y cuántas cargó recepción.",
      monto: { mide: "La merma del mes en pesos, a costo, y qué parte de la venta cobrada del mes es.", capability: "reports:read" },
    },
    palabras: ["mermas", "rotura", "recuento", "vencidos"],
    menuDeHoy: { etiqueta: "Ajustes", orden: 140, moduloDeHoy: "catalog" },
  },
  {
    id: "proveedores",
    nombre: "Proveedores",
    descripcion: "La ficha de cada proveedor: CUIT, contacto, compras y devoluciones.",
    icono: "compras",
    ruta: "/admin/proveedores",
    espacio: "stock",
    capability: "purchasing:manage",
    modulo: "inventario",
    estado: "lista",
    kpi: { id: "proveedores", mide: "Proveedores activos y cuántos no tienen CUIT cargado." },
    palabras: ["cuit", "distribuidores", "razon social", "contactos"],
  },
  {
    id: "lotes-y-vencimientos",
    nombre: "Lotes y vencimientos",
    descripcion: "Cada lote al vacío con su fecha de vencimiento.",
    icono: "lotes",
    ruta: "/admin/lotes",
    espacio: "stock",
    capability: "catalog:read",
    modulo: "inventario",
    rubro: "carniceria",
    estado: "lista",
    kpi: {
      id: "lotes-y-vencimientos",
      mide: "Lotes que vencen en 3 días o menos.",
      monto: { mide: "La plata en riesgo de esos lotes, a costo.", capability: "reports:read" },
    },
    palabras: ["vencimientos", "envasado al vacio", "trazabilidad"],
    menuDeHoy: { etiqueta: "Lotes / Vacío", orden: 120, moduloDeHoy: "catalog" },
  },
  {
    id: "despiece",
    nombre: "Despiece",
    descripcion: "De la media res a los cortes: rendimiento y costo por kilo.",
    icono: "despiece",
    ruta: "/admin/despiece",
    espacio: "stock",
    capability: "catalog:read",
    modulo: "inventario",
    rubro: "carniceria",
    estado: "lista",
    kpi: { id: "despiece", mide: "Rendimiento de los despieces de los últimos 30 días." },
    palabras: ["cortes", "media res", "rendimiento"],
    menuDeHoy: { etiqueta: "Despiece", orden: 130, moduloDeHoy: "catalog" },
  },
  {
    id: "devoluciones-a-proveedor",
    nombre: "Devoluciones a proveedor",
    descripcion: "Devolver mercadería: baja el stock y queda el crédito a favor.",
    icono: "devoluciones",
    ruta: "/admin/devoluciones-proveedor",
    espacio: "stock",
    capability: "purchasing:manage",
    modulo: "devoluciones-proveedor",
    perfilMin: "enterprise",
    estado: "lista",
    kpi: { id: "devoluciones-a-proveedor", mide: "Plata devuelta a proveedores este mes.", capability: "reports:read" },
    menuDeHoy: { etiqueta: "Devoluciones a proveedor", orden: 280, moduloDeHoy: null },
  },
] as const satisfies readonly AppDescriptor[];
