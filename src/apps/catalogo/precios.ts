// ============================================================================
// CATÁLOGO DE APPS — Catálogo y precios.
// ============================================================================
//
// La capability es la que exige la PÁGINA (el loader `getCatalog` pide catalog:read),
// no la del menú de hoy (catalog:manage). Hoy da lo mismo para los tres roles (OWNER tiene
// las dos, RECEPTION y PROFESSIONAL ninguna) y el test de paridad lo verifica; si algún día
// un rol recibe una sin la otra, ese test lo marca antes de que el menú y la página se
// contradigan. Editar sigue pidiendo catalog:manage en cada action.
//
// Actualizar precios y Etiquetas (ola 2) piden catalog:manage directo: las dos escriben (una
// cambia precios, la otra deja el registro de lo que se imprimió), y la misma capability la
// exige `requireAppAccion` en sus acciones.
//
// RUBRO: las dos nuevas son de MOSTRADOR aunque el catálogo de producto diga "todos" (desvío
// a ratificar por el orquestador). Trabajan sobre el precio de venta de los productos
// (`Product.price`/`pricePerKg`). El motivo NO es que una estética no tenga productos con
// precio: los tiene (en la base de QA, 6 de los 7 productos de beauty-spa tienen precio, y con
// precio aparecen en la caja, ProductsSection.tsx). El motivo es que CH no cambia sin el OK del
// dueño, y en una estética lo que más se reprecia son los servicios, que son otra tabla y estas
// apps no tocan. Consecuencia: en CH, editar el precio de un producto desde el Catálogo no deja
// fila `cambio-de-precio` (catalog-actions.ts, rama de servicios). Cuando se sume el cambio en
// bloque de los precios de servicios, se saca el rubro acá.

import type { AppDescriptor } from "../contract";

export const APPS_PRECIOS = [
  {
    id: "catalogo",
    nombre: "Catálogo",
    descripcion: "Lo que vendés, con su precio y su costo.",
    icono: "catalogo",
    ruta: "/admin/catalogo",
    espacio: "precios",
    capability: "catalog:read",
    modulo: "catalog",
    estado: "lista",
    kpi: { id: "catalogo", mide: "Productos activos sin precio de venta y sin costo vigente." },
    palabras: ["servicios", "precios", "productos", "tratamientos", "profesionales", "horarios"],
    menuDeHoy: { etiqueta: "Catálogo", orden: 90 },
  },
  {
    id: "actualizar-precios",
    nombre: "Actualizar precios",
    descripcion: "Subir o bajar muchos precios a la vez, con redondeo y vista previa.",
    icono: "ajustes",
    ruta: "/admin/catalogo/precios",
    espacio: "precios",
    capability: "catalog:manage",
    modulo: "catalog",
    rubro: "mostrador",
    estado: "lista",
    kpi: { id: "actualizar-precios", mide: "Cuántos días pasaron desde el último aumento general." },
    palabras: ["aumento", "aumentar", "inflacion", "remarcar", "porcentaje", "lista de precios"],
  },
  {
    id: "etiquetas-de-precio",
    nombre: "Etiquetas de precio",
    descripcion: "Imprimir los carteles de góndola, empezando por los precios que cambiaron.",
    icono: "lotes",
    ruta: "/admin/catalogo/etiquetas",
    espacio: "precios",
    capability: "catalog:manage",
    modulo: "catalog",
    rubro: "mostrador",
    estado: "lista",
    kpi: { id: "etiquetas-de-precio", mide: "Precios que cambiaron y todavía no se reimprimieron." },
    palabras: ["carteles", "imprimir", "gondola", "heladera", "rotulos", "precio por kilo"],
  },
  {
    // Ola 3: los cupones valen en el mostrador y en la tienda (antes, sólo en los turnos). La
    // pantalla reusa la sección de cupones del Catálogo; en CH los cupones siguen DENTRO del
    // Catálogo (esta app no lleva `menuDeHoy`, así que su barra no cambia) hasta que el dueño
    // apruebe el modelo por apps. La capability es la de cargar cupones: la que pide cada action.
    id: "promociones",
    nombre: "Promociones y cupones",
    descripcion: "Cupones de descuento para el mostrador, la tienda online y los turnos.",
    icono: "catalogo",
    ruta: "/admin/promociones",
    espacio: "precios",
    capability: "coupons:manage",
    modulo: "catalog",
    estado: "lista",
    kpi: { id: "promociones", mide: "Cupones prendidos y sin vencer, y cuántas veces se usaron." },
    palabras: ["cupones", "cupon", "descuento", "promo", "codigo de descuento"],
  },
] as const satisfies readonly AppDescriptor[];
