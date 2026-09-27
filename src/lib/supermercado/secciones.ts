// ============================================================================
// SECCIÓN DE UN PRODUCTO DEL SUPERMERCADO — la explícita o la que sale del nombre.
// ============================================================================
//
// La sección (almacén, bebidas, lácteos…) ordena la vidriera, elige los productos de una promo
// "20 % en limpieza" y de un cambio de precios "subir bebidas un 8 %". Se guarda en
// `Product.category`, la columna de "góndola" de la migración que todavía espera en
// prisma/pending-gate2/CarniceriaRubro.sql. Mientras esa columna no exista en la base (hoy, en
// producción), la sección sale del NOMBRE del producto con este clasificador: el mismo criterio
// que la carnicería usa para sus cortes (carniceria/cortes.ts). Con la columna, manda la
// explícita y esto queda de sugerencia.
//
// El clasificador reconoce los 380 productos del catálogo semilla (lo fija un test) y las
// formas comunes de nombrar lo mismo. Un producto que no reconoce cae en Almacén: es la
// sección "de todo" de un súper, y la persona lo cambia si tiene la columna.
//
// PURO: sin base ni React.

import { esSeccionSuper, type SeccionSuperId } from "@/blueprints/retail/supermercado-tipos";

/** Minúsculas, sin acentos ni signos, con un espacio en cada borde para buscar palabras. */
export function normalizarParaSeccion(nombre: string): string {
  return ` ${String(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

type Regla = { seccion: SeccionSuperId; palabras: readonly string[] };

// Productos por PESO: sólo pueden ser de las secciones con balanza. El orden es la prioridad.
const REGLAS_PESO: readonly Regla[] = [
  {
    seccion: "fiambreria",
    palabras: [" jamon", " paleta", " salame", " salamin", " mortadela", " curad", " queso", " aceituna", " salchichon", " pastron", " lomito", " ahumad", " fiambre"],
  },
  { seccion: "panaderia", palabras: [" pan ", " galletitas", " facturas", " bizcocho", " grisin"] },
  {
    seccion: "carniceria",
    palabras: [
      " asado", " vacio", " matambre", " bife", " lomo", " cuadril", " nalga", " peceto", " carne", " osobuco", " falda",
      " roast", " milanesa", " higado", " pollo", " pata muslo", " pechuga", " suprema", " cerdo", " costilla", " chorizo",
      " morcilla", " achura", " molleja", " entrana", " tapa de asado", " colita",
    ],
  },
];

// Productos por UNIDAD. El orden es la prioridad: la primera regla que acierta gana.
const REGLAS_UNIDAD: readonly Regla[] = [
  // Lo que en el nombre parece de otra sección y es de almacén.
  {
    seccion: "almacen",
    palabras: [" pan rallado", " papas fritas", " tapas para", " pure de papas", " galletitas", " alfajor", " bizcochuelo", " dulce de batata", " snack"],
  },
  // Jabones de ropa y aromatizantes, antes que perfumería (jabón de tocador, desodorante).
  { seccion: "limpieza", palabras: [" desodorante de ambiente", " jabon en polvo", " jabon liquido", " jabon en pan"] },
  {
    seccion: "perfumeria",
    palabras: [
      " jabon de tocador", " shampoo", " acondicionador", " desodorante", " pasta dental", " cepillo de dientes", " enjuague",
      " afeitar", " toallas femeninas", " protectores diarios", " panales", " algodon", " hisopos", " nivea", " crema de manos",
      " alcohol en gel", " alcohol etilico", " apositos", " perfume", " colonia", " maquina de afeitar",
    ],
  },
  {
    seccion: "limpieza",
    palabras: [
      " lavandina", " detergente", " suavizante", " limpiador", " desinfectante", " insecticida", " espiral", " papel higienico",
      " rollo de cocina", " servilletas", " esponja", " bolsas de residuo", " lustramuebles", " repelente", " lavavajillas",
      " trapo", " rejilla", " fosforos", " escoba", " secador",
    ],
  },
  {
    seccion: "panaderia",
    palabras: [" prepizza", " facturas", " medialunas", " chipa", " budin", " torta", " tostadas", " bizcochos de", " grisines"],
  },
  {
    seccion: "bebidas",
    palabras: [
      " te helado", " hielo en cubos", " gaseosa", " agua mineral", " agua saborizada", " agua tonica", " jugo", " bebida",
      " cerveza", " vino", " espumante", " champagne", " sidra", " fernet", " aperitivo", " vermut", " vodka", " whisky", " gin ",
      " amargo", " soda",
    ],
  },
  {
    seccion: "congelados",
    palabras: [
      " congelad", " helado", " hamburguesas", " medallones", " bocaditos", " prefritas", " noisettes", " ravioles", " nuggets",
      " milanesas de soja", " patitas", " rolitos",
    ],
  },
  {
    seccion: "lacteos",
    palabras: [" leche", " yogur", " postre", " manteca", " crema de leche", " crema chantilly", " queso", " ricota", " huevos", " actimel"],
  },
  { seccion: "fiambreria", palabras: [" salchichas", " jamon", " salame", " pate ", " mortadela"] },
  { seccion: "verduleria", palabras: [" lechuga", " acelga", " espinaca", " perejil", " palta", " anana", " champinones", " rucula"] },
];

/**
 * La sección que sale del nombre. `saleUnit` WEIGHT = se pesa: sólo fiambrería, panadería,
 * carnicería o verdulería (la que no reconoce, verdulería). PURA.
 */
export function seccionPorNombre(p: { name: string; saleUnit: string }): SeccionSuperId {
  const n = normalizarParaSeccion(p.name);
  const nInicio = n.trimStart(); // "pan lactal …" empieza con "pan "
  if (p.saleUnit === "WEIGHT") {
    for (const r of REGLAS_PESO) if (r.palabras.some((w) => n.includes(w))) return r.seccion;
    return "verduleria";
  }
  if (nInicio.startsWith("pan ") && !nInicio.startsWith("pan rallado")) return "panaderia";
  // "Chocolate con leche" es de almacén; un helado o un postre de chocolate, no.
  if (nInicio.startsWith("chocolate ")) return "almacen";
  for (const r of REGLAS_UNIDAD) if (r.palabras.some((w) => n.includes(w))) return r.seccion;
  return "almacen";
}

/** La sección del producto: la explícita (`Product.category`) si es una del súper; si no, la del nombre. */
export function seccionDe(p: { name: string; saleUnit: string; category?: string | null }): SeccionSuperId {
  return esSeccionSuper(p.category) ? p.category : seccionPorNombre(p);
}
