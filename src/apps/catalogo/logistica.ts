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
// CAPABILITY: la que exige la página hoy. Inventario, Lotes y Despiece la piden en la
// página; Recibir mercadería y Mermas, en su loader (getStockData / getAdjustmentData):
// catalog:read. El menú de hoy decía catalog:manage para varias; para los tres roles da
// lo mismo y el test de paridad lo vigila. Recibir y cargar mermas desde RECEPTION llega en
// la ola 2 con las capabilities de stock nuevas: ahí se cambia acá, no en otra lista.
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
    modulo: "inventario",
    rubro: "mostrador",
    estado: "lista",
    kpi: {
      id: "inventario",
      mide: "Productos bajo el mínimo y productos sin costo.",
      monto: { mide: "El stock valorizado a costo.", capability: "reports:read" },
    },
    palabras: ["stock", "existencias"],
    menuDeHoy: { etiqueta: "Inventario", orden: 110, moduloDeHoy: "catalog" },
  },
  {
    id: "recibir-mercaderia",
    nombre: "Recibir mercadería",
    descripcion: "Cargar lo que llegó del proveedor, con su costo.",
    icono: "compras",
    ruta: "/admin/compras",
    espacio: "stock",
    capability: "catalog:read",
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
    modulo: "inventario",
    estado: "lista",
    kpi: {
      id: "mermas",
      mide: "Mermas cargadas este mes.",
      monto: { mide: "La merma del mes en pesos y en porcentaje de la venta.", capability: "reports:read" },
    },
    palabras: ["mermas", "rotura", "recuento", "vencidos"],
    menuDeHoy: { etiqueta: "Ajustes", orden: 140, moduloDeHoy: "catalog" },
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
    capability: "catalog:manage",
    modulo: "devoluciones-proveedor",
    perfilMin: "enterprise",
    estado: "lista",
    kpi: { id: "devoluciones-a-proveedor", mide: "Plata devuelta a proveedores este mes.", capability: "reports:read" },
    menuDeHoy: { etiqueta: "Devoluciones a proveedor", orden: 280, moduloDeHoy: null },
  },
] as const satisfies readonly AppDescriptor[];
