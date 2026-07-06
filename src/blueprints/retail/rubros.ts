// Rubros del blueprint "Retail / Mostrador" — CONFIGURACIÓN PURA por rubro.
//
// El blueprint retail (POS, stock, venta por peso/unidad, …) es UNO solo, en código
// (`retail.ts`); lo que cambia entre una carnicería, una verdulería, una dietética,
// un kiosco, una fiambrería o una indumentaria es SÓLO este archivo de config:
// catálogo, wording del rubro (para que la vidriera se sienta "hecha para ese
// negocio"), branding por defecto y qué módulos usa cada rubro. Cero código por rubro.
//
// DATOS PROVISIONALES: catálogos, precios (AR, mediados 2026), contacto/branding son
// valores razonables de referencia para la demo, NO la lista real de ningún negocio.
// El negocio los edita. Marcados como provisionales acá y en la doc del blueprint.

import type { TenantBrandingDefaults } from "../types";

// Módulos del blueprint retail (set definido por PO). Cada rubro declara cuáles usa
// de forma central; hoy es config informativa (feeds la futura activación de pantallas
// por tenant — ver docs/blueprints/retail-mostrador.md §"Gap: nav por rubro").
export type RetailModuleId =
  | "pos" // punto de venta / mostrador (capability Orden)
  | "stock" // control de existencias
  | "venta-peso" // venta por kg (balanza / gramaje)
  | "venta-unidad" // venta por unidad
  | "proveedores" // proveedores + compras (ingreso de stock) — spec, no implementado aún
  | "listas-precio" // listas de precio (minorista/mayorista) — spec, no implementado aún
  | "cuenta-corriente"; // fiado / mayoristas — spec, no implementado aún

// Copy del rubro para la vidriera y el POS: el nombre de las cosas cambia para que el
// cliente sienta que es su negocio ("Nuestros cortes" vs "Nuestras frutas y verduras").
export interface RetailWording {
  /** Título de la sección de catálogo en la vidriera. */
  catalogHeading: string;
  /** Sustantivo del ítem, singular ("corte", "producto"), para textos varios. */
  itemNoun: string;
  /** Bajada del hero de la vidriera. */
  heroTagline: string;
  /** Texto del botón de checkout. */
  orderCta: string;
  /** Aclaración bajo el total (p. ej. peso variable). null = sin aclaración. */
  weightNote: string | null;
}

// Un ítem del catálogo semilla. `kg` = venta por peso (precio/kg); `u` = por unidad.
export type RetailCatalogItem =
  | { name: string; sale: "kg"; pricePerKg: number; stock: number }
  | { name: string; sale: "u"; price: number; stock: number };

export interface RetailRubro {
  id: string;
  /** Nombre legible del rubro ("Carnicería"). */
  label: string;
  wording: RetailWording;
  /** Módulos del blueprint retail que el rubro usa de forma central. */
  modules: RetailModuleId[];
  /** Branding por defecto (BusinessSettings). Provisional; el negocio lo edita. */
  brandingDefaults: TenantBrandingDefaults;
  /** Catálogo semilla del rubro. */
  catalog: RetailCatalogItem[];
}

// --- Carnicería (rubro de `magra`, primera instancia) ---
const carniceria: RetailRubro = {
  id: "carniceria",
  // Arquetipo informado por el negocio real de magra (boutique premium de carnes
  // envasadas al vacío, delivery-first): ver docs/preventa/analisis-redes-magra.md.
  // El branding y catálogo REALES de magra viven en su recipe de tenant
  // (docs/tenants/magra/provisioning-magra.md), no acá — esto es el template reusable.
  label: "Carnicería boutique",
  wording: {
    catalogHeading: "La selección",
    itemNoun: "corte",
    heroTagline: "Carnes premium envasadas al vacío, elegidas una por una. Pedí online y te llega a casa.",
    orderCta: "Hacé tu pedido",
    weightNote: "El total puede ajustarse al peso real de cada pieza envasada.",
  },
  modules: ["pos", "stock", "venta-peso", "venta-unidad", "proveedores", "cuenta-corriente"],
  // addressLine/whatsapp/instagram: PROVISIONALES (mismo dato que tenía el blueprint
  // standalone `carniceria.ts`, ahora consolidado acá — únicos placeholders sin el
  // alta real de magra los pisa vía flags de `provision-tenant.ts`, ver
  // docs/tenants/magra/provisioning-magra.md).
  brandingDefaults: {
    shortLabel: "Carnes premium",
    addressLine: "Av. Provisional 1234, Canning", // provisional
    city: "Canning, Buenos Aires",
    hoursLabel: "Lun a Sáb 10–20h · Dom 9–13h",
    whatsapp: "5491100000000", // provisional
    instagram: "@magra.carniceria", // provisional
    contactNote: "Carnes premium envasadas al vacío, más una línea gourmet elegida con el mismo criterio.",
  },
  // Líneas REALES de magra (de su web): vaca Angus de Estancia Don Ramón, cerdo magro,
  // pollo orgánico, más una línea gourmet. Precios PROVISIONALES (ARS, mediados 2026)
  // hasta que el dueño confirme su lista real (hoy vive en Bistrosoft).
  catalog: [
    // Vaca — Estancia Don Ramón (Angus), envasada al vacío
    { name: "Lomo", sale: "kg", pricePerKg: 18900, stock: 14 },
    { name: "Ojo de bife", sale: "kg", pricePerKg: 16900, stock: 18 },
    { name: "Bife de chorizo", sale: "kg", pricePerKg: 15900, stock: 20 },
    { name: "Entraña", sale: "kg", pricePerKg: 17500, stock: 12 },
    { name: "Cuadril", sale: "kg", pricePerKg: 12900, stock: 22 },
    { name: "Colita de cuadril", sale: "kg", pricePerKg: 13500, stock: 16 },
    { name: "Asado de tira", sale: "kg", pricePerKg: 11500, stock: 30 },
    { name: "Vacío", sale: "kg", pricePerKg: 12500, stock: 20 },
    { name: "Milanesas de nalga", sale: "kg", pricePerKg: 12900, stock: 25 },
    { name: "Carne picada especial", sale: "kg", pricePerKg: 9500, stock: 30 },
    // Cerdo — cortes magros, bajos en grasa
    { name: "Bondiola de cerdo", sale: "kg", pricePerKg: 10500, stock: 16 },
    { name: "Solomillo de cerdo", sale: "kg", pricePerKg: 11500, stock: 12 },
    // Pollo orgánico
    { name: "Pechuga de pollo orgánico", sale: "kg", pricePerKg: 8900, stock: 24 },
    { name: "Pollo entero orgánico (~2 kg)", sale: "u", price: 12900, stock: 15 },
    // Preparados
    { name: "Hamburguesas caseras (x4)", sale: "u", price: 6900, stock: 30 },
    // Gourmet — línea premium elegida con el mismo criterio
    { name: "Sorrentinos italianos (Lamberti)", sale: "u", price: 6500, stock: 24 },
    { name: "Salsa artesanal importada", sale: "u", price: 5200, stock: 20 },
    { name: "Ensalada premium envasada", sale: "u", price: 3900, stock: 18 },
    { name: "Filet de merluza congelado", sale: "u", price: 8900, stock: 16 },
  ],
};

// --- Verdulería / Frutería ---
const verduleria: RetailRubro = {
  id: "verduleria",
  label: "Verdulería",
  wording: {
    catalogHeading: "Frutas y verduras",
    itemNoun: "producto",
    heroTagline: "Fruta y verdura fresca del día. Armá tu pedido y pasá a buscarlo o te lo llevamos.",
    orderCta: "Enviar pedido",
    weightNote: "El total final se ajusta al peso real pesado en el local.",
  },
  modules: ["pos", "stock", "venta-peso", "venta-unidad", "proveedores"],
  brandingDefaults: {
    shortLabel: "La Huerta · barrio",
    city: "Buenos Aires",
    hoursLabel: "Lun a sáb · 8 a 20 h",
    contactNote: "Verdulería de barrio — fruta y verdura fresca todos los días.",
  },
  catalog: [
    { name: "Tomate redondo", sale: "kg", pricePerKg: 2200, stock: 40 },
    { name: "Papa", sale: "kg", pricePerKg: 1300, stock: 80 },
    { name: "Cebolla", sale: "kg", pricePerKg: 1500, stock: 60 },
    { name: "Zanahoria", sale: "kg", pricePerKg: 1400, stock: 45 },
    { name: "Manzana roja", sale: "kg", pricePerKg: 2600, stock: 50 },
    { name: "Banana", sale: "kg", pricePerKg: 2100, stock: 55 },
    { name: "Naranja de jugo", sale: "kg", pricePerKg: 1200, stock: 70 },
    { name: "Frutilla", sale: "kg", pricePerKg: 4800, stock: 15 },
    { name: "Zapallo anco", sale: "kg", pricePerKg: 1600, stock: 30 },
    { name: "Lechuga mantecosa", sale: "u", price: 900, stock: 40 },
    { name: "Palta", sale: "u", price: 1500, stock: 35 },
    { name: "Docena de huevos", sale: "u", price: 3600, stock: 30 },
  ],
};

// --- Dietética / Almacén natural ---
const dietetica: RetailRubro = {
  id: "dietetica",
  label: "Dietética",
  wording: {
    catalogHeading: "Nuestros productos",
    itemNoun: "producto",
    heroTagline: "Frutos secos, cereales y almacén natural. Comprá por peso lo que necesites.",
    orderCta: "Enviar pedido",
    weightNote: "El total final se ajusta al peso real fraccionado en el local.",
  },
  modules: ["pos", "stock", "venta-peso", "venta-unidad", "listas-precio"],
  brandingDefaults: {
    shortLabel: "Semilla · dietética",
    city: "Buenos Aires",
    hoursLabel: "Lun a sáb · 9 a 19 h",
    contactNote: "Dietética y almacén natural — a granel y envasado.",
  },
  catalog: [
    { name: "Almendras", sale: "kg", pricePerKg: 12800, stock: 20 },
    { name: "Nueces peladas", sale: "kg", pricePerKg: 14500, stock: 18 },
    { name: "Castañas de cajú", sale: "kg", pricePerKg: 13900, stock: 15 },
    { name: "Pasas de uva", sale: "kg", pricePerKg: 5600, stock: 25 },
    { name: "Granola artesanal", sale: "kg", pricePerKg: 6900, stock: 22 },
    { name: "Avena arrollada", sale: "kg", pricePerKg: 2400, stock: 40 },
    { name: "Harina integral", sale: "kg", pricePerKg: 1900, stock: 35 },
    { name: "Semillas de chía", sale: "kg", pricePerKg: 7200, stock: 20 },
    { name: "Lentejas", sale: "kg", pricePerKg: 3200, stock: 30 },
    { name: "Miel pura (frasco 500g)", sale: "u", price: 4800, stock: 24 },
    { name: "Té verde (100g)", sale: "u", price: 2600, stock: 30 },
  ],
};

// --- Kiosco / Autoservicio ---
const kiosco: RetailRubro = {
  id: "kiosco",
  label: "Kiosco",
  wording: {
    catalogHeading: "Productos",
    itemNoun: "producto",
    heroTagline: "Golosinas, bebidas y algo para el momento. Encargá y pasá a buscarlo.",
    orderCta: "Enviar pedido",
    weightNote: null,
  },
  modules: ["pos", "stock", "venta-unidad", "proveedores"],
  brandingDefaults: {
    shortLabel: "Kiosco 24hs",
    city: "Buenos Aires",
    hoursLabel: "Todos los días · 8 a 24 h",
    contactNote: "Kiosco de barrio — golosinas, bebidas y cigarrillos.",
  },
  catalog: [
    { name: "Gaseosa línea 500 ml", sale: "u", price: 1500, stock: 60 },
    { name: "Agua mineral 500 ml", sale: "u", price: 900, stock: 50 },
    { name: "Alfajor triple", sale: "u", price: 1800, stock: 45 },
    { name: "Chocolate 25 g", sale: "u", price: 1200, stock: 40 },
    { name: "Paquete de galletitas", sale: "u", price: 1600, stock: 35 },
    { name: "Papas fritas 100 g", sale: "u", price: 2200, stock: 30 },
    { name: "Cerveza lata 473 ml", sale: "u", price: 2100, stock: 48 },
    { name: "Chicles", sale: "u", price: 700, stock: 60 },
    { name: "Caramelos surtidos", sale: "kg", pricePerKg: 4200, stock: 12 },
    { name: "Turrón", sale: "u", price: 900, stock: 40 },
  ],
};

// --- Fiambrería / Quesería ---
const fiambreria: RetailRubro = {
  id: "fiambreria",
  label: "Fiambrería",
  wording: {
    catalogHeading: "Fiambres y quesos",
    itemNoun: "producto",
    heroTagline: "Fiambres y quesos cortados como te gustan. Armá tu picada y retirala.",
    orderCta: "Enviar pedido",
    weightNote: "El total final se ajusta al peso real cortado en el mostrador.",
  },
  modules: ["pos", "stock", "venta-peso", "venta-unidad", "proveedores", "cuenta-corriente"],
  brandingDefaults: {
    shortLabel: "La Rueda · fiambrería",
    city: "Buenos Aires",
    hoursLabel: "Mar a dom · 9 a 20 h",
    contactNote: "Fiambrería y quesería — picadas y cortes al peso.",
  },
  catalog: [
    { name: "Jamón cocido", sale: "kg", pricePerKg: 9800, stock: 14 },
    { name: "Jamón crudo", sale: "kg", pricePerKg: 22000, stock: 8 },
    { name: "Salame Milán", sale: "kg", pricePerKg: 15500, stock: 10 },
    { name: "Mortadela", sale: "kg", pricePerKg: 7200, stock: 16 },
    { name: "Queso cremoso", sale: "kg", pricePerKg: 9500, stock: 18 },
    { name: "Queso pategrás", sale: "kg", pricePerKg: 11800, stock: 12 },
    { name: "Provolone", sale: "kg", pricePerKg: 13400, stock: 9 },
    { name: "Aceitunas verdes", sale: "kg", pricePerKg: 6800, stock: 15 },
    { name: "Ricota", sale: "kg", pricePerKg: 5200, stock: 10 },
    { name: "Manteca (200 g)", sale: "u", price: 2600, stock: 24 },
  ],
};

// --- Indumentaria / Boutique ---
const indumentaria: RetailRubro = {
  id: "indumentaria",
  label: "Indumentaria",
  wording: {
    catalogHeading: "Colección",
    itemNoun: "prenda",
    heroTagline: "Prendas seleccionadas. Reservá tu talle y pasá a probártelo.",
    orderCta: "Reservar",
    weightNote: null,
  },
  modules: ["pos", "stock", "venta-unidad", "listas-precio", "proveedores"],
  brandingDefaults: {
    shortLabel: "Índigo · boutique",
    city: "Buenos Aires",
    hoursLabel: "Lun a sáb · 10 a 20 h",
    contactNote: "Boutique de indumentaria — prendas seleccionadas.",
  },
  catalog: [
    { name: "Remera básica", sale: "u", price: 12900, stock: 40 },
    { name: "Pantalón de jean", sale: "u", price: 38900, stock: 25 },
    { name: "Buzo canguro", sale: "u", price: 32900, stock: 22 },
    { name: "Camisa lino", sale: "u", price: 28900, stock: 18 },
    { name: "Campera de abrigo", sale: "u", price: 64900, stock: 12 },
    { name: "Vestido midi", sale: "u", price: 42900, stock: 15 },
    { name: "Zapatillas urbanas", sale: "u", price: 79900, stock: 20 },
    { name: "Pack de medias (x3)", sale: "u", price: 8900, stock: 50 },
    { name: "Gorra", sale: "u", price: 14900, stock: 30 },
    { name: "Bufanda de lana", sale: "u", price: 16900, stock: 20 },
  ],
};

// --- Velas, aromas & deco / Bazar de experiencia (rubro de `shinevelas`) ---
// Rubro VISUAL y EXPERIENCIAL — no es sólo vender velas: es velas (aromáticas,
// decorativas, artesanales) + aromas + DECORACIÓN para el hogar + accesorios del
// ritual. Todo venta por unidad, sin balanza. Las SECCIONES del catálogo salen del
// clasificador por nombre (src/lib/storefront-visual.ts → productSection). Arquetipo
// informado por el negocio real de Shine; el branding/copy REALES viven en el tenant.
// Precios PROVISIONALES (ARS, mediados 2026), a confirmar por el negocio.
const velas: RetailRubro = {
  id: "velas",
  label: "Velas & deco",
  wording: {
    catalogHeading: "La colección",
    itemNoun: "producto",
    heroTagline: "Velas, aromas y decoración para transformar tu casa en un ambiente. Armá el tuyo.",
    orderCta: "Hacer pedido",
    weightNote: null,
  },
  modules: ["pos", "stock", "venta-unidad", "proveedores"],
  brandingDefaults: {
    shortLabel: "Velas · aromas · deco",
    city: "CABA",
    hoursLabel: "Lun a vie · 10 a 18 h · pedidos por WhatsApp",
    contactNote: "Velas de soja, difusores, decoración y accesorios hechos y elegidos a mano.",
  },
  // Catálogo experiencial: velas (aromáticas/decorativas/artesanales), aromas,
  // decoración para el hogar y accesorios del ritual. Los nombres alimentan las
  // secciones de la vidriera (ver productSection). Precios ARS provisionales.
  catalog: [
    // Velas aromáticas (soja + mecha de algodón)
    { name: "Vela Vainilla y Canela", sale: "u", price: 8500, stock: 24 },
    { name: "Vela Flor de Naranjo", sale: "u", price: 8500, stock: 24 },
    { name: "Vela Sándalo", sale: "u", price: 9000, stock: 20 },
    { name: "Vela Lavanda", sale: "u", price: 8500, stock: 22 },
    // Velas decorativas
    { name: "Vela decorativa tallada", sale: "u", price: 11900, stock: 15 },
    { name: "Vela en copa de vidrio ámbar", sale: "u", price: 10500, stock: 18 },
    // Velas artesanales
    { name: "Vela artesanal de cera de abeja", sale: "u", price: 9800, stock: 16 },
    { name: "Vela de masaje humectante", sale: "u", price: 8900, stock: 14 },
    // Aromas
    { name: "Difusor Coco y Vainilla", sale: "u", price: 11000, stock: 18 },
    { name: "Difusor Jazmín", sale: "u", price: 11000, stock: 16 },
    { name: "Difusor Cedro y Ámbar", sale: "u", price: 11500, stock: 14 },
    { name: "Aromatizante Textil Flores Blancas", sale: "u", price: 6500, stock: 30 },
    { name: "Sahumerios de sándalo (pack x6)", sale: "u", price: 3200, stock: 60 },
    { name: "Home spray Lavanda", sale: "u", price: 7200, stock: 24 },
    // Decoración para el hogar
    { name: "Portavela de cerámica artesanal", sale: "u", price: 6500, stock: 20 },
    { name: "Bandeja deco de madera", sale: "u", price: 9400, stock: 16 },
    { name: "Florero de vidrio soplado", sale: "u", price: 12800, stock: 12 },
    { name: "Espejo decorativo redondo", sale: "u", price: 18900, stock: 8 },
    // Accesorios del ritual
    { name: "Cortamechas de acero", sale: "u", price: 5200, stock: 24 },
    { name: "Fósforos largos deco (frasco)", sale: "u", price: 3800, stock: 40 },
  ],
};

// --- Pádel (rubro de `adosmanos`) — tienda MINIMALISTA de equipamiento ---
// A Dos Manos Pádel: tienda chica, foco en dos líneas (palas + zapatillas), venta
// por unidad. Referencia de estructura/calidad de compra: padelcanning.com.ar, pero
// catálogo deliberadamente ACOTADO (no la amplitud de Canning). El precio con
// transferencia (~28% off) y las cuotas son de la capa de checkout/pago, no del
// catálogo semilla. Precios PROVISIONALES (ARS, mediados 2026) hasta lista real.
const padel: RetailRubro = {
  id: "padel",
  label: "Tienda de pádel",
  wording: {
    catalogHeading: "Palas y zapatillas",
    itemNoun: "producto",
    heroTagline: "Palas y zapatillas de pádel, elegidas para que juegues mejor. Mirá el catálogo y hacé tu pedido.",
    orderCta: "Hacé tu pedido",
    weightNote: null,
  },
  modules: ["pos", "stock", "venta-unidad"],
  brandingDefaults: {
    shortLabel: "A Dos Manos Pádel",
    hoursLabel: "Lun a sáb · 10 a 19 h",
    contactNote: "Palas y zapatillas de pádel de las mejores marcas, con asesoramiento personalizado.",
  },
  // Dos líneas, marcas líderes. El nombre lleva la marca (no hay campo `brand` en el
  // Core todavía); la vidriera filtra por marca a partir del nombre.
  catalog: [
    // Palas
    { name: "Pala Adidas Metalbone 3.4", sale: "u", price: 329900, stock: 8 },
    { name: "Pala Bullpadel Vertex 04", sale: "u", price: 349900, stock: 6 },
    { name: "Pala Nox AT10 Genius 18K", sale: "u", price: 289900, stock: 7 },
    { name: "Pala Siux Electra ST3 Stupa", sale: "u", price: 259900, stock: 9 },
    { name: "Pala Head Speed Motion", sale: "u", price: 219900, stock: 10 },
    { name: "Pala Adidas RX Series", sale: "u", price: 129900, stock: 14 },
    // Zapatillas
    { name: "Zapatillas Asics Gel-Padel Pro", sale: "u", price: 189900, stock: 12 },
    { name: "Zapatillas Adidas Ubersonic 4", sale: "u", price: 179900, stock: 11 },
    { name: "Zapatillas Bullpadel Hack Vibram", sale: "u", price: 169900, stock: 9 },
    { name: "Zapatillas Head Sprint Pro 3.5", sale: "u", price: 149900, stock: 13 },
  ],
};

export const RETAIL_RUBROS: Record<string, RetailRubro> = {
  carniceria,
  verduleria,
  dietetica,
  kiosco,
  fiambreria,
  indumentaria,
  velas,
  padel,
};

export const RETAIL_RUBRO_IDS = Object.keys(RETAIL_RUBROS);

// Wording genérico cuando el rubro no se conoce (tenant retail sin rubro mapeado):
// una tienda de mostrador neutra, correcta para cualquier rubro.
export const GENERIC_RETAIL_WORDING: RetailWording = {
  catalogHeading: "Nuestros productos",
  itemNoun: "producto",
  heroTagline: "Elegí lo que necesitás y hacé tu pedido. Pasá a buscarlo o te lo acercamos.",
  orderCta: "Enviar pedido",
  weightNote: "El total puede ajustarse según el peso real en el local.",
};

export function getRetailRubro(id: string): RetailRubro | null {
  return RETAIL_RUBROS[id] ?? null;
}

// Resolución tenant → rubro por slug, MIENTRAS no exista `Tenant.blueprintId` (misma
// estrategia que el acento por slug en src/lib/branding.ts). Cuando esa columna se
// despliegue, esto pasa a leerla con fallback a este mapa — un único punto de cambio.
const RUBRO_BY_SLUG: Record<string, string> = {
  magra: "carniceria",
  shinevelas: "velas",
  adosmanos: "padel",
};

export function resolveRubroIdBySlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return RUBRO_BY_SLUG[slug] ?? null;
}
