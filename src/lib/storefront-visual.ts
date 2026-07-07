// Visual y categorización de producto de la vidriera — LÓGICA PURA (sin DB ni red),
// testeable.
//
// El Core no guarda fotos de producto (todavía). La vidriera genérica mostraba
// tarjetas SÓLO texto: correcto para una carnicería, pobre para un rubro visual y
// EXPERIENCIAL como velas/deco. En vez de una "caja vacía", derivamos de forma
// DETERMINÍSTICA (mismo nombre → mismo visual, estable entre renders y SSR/CSR) un
// panel de marca: un halo cálido —el "shine" de una vela— teñido con el acento del
// tenant, más un glifo de la categoría del producto inferida del nombre.
//
// La MISMA clasificación agrupa el catálogo en SECCIONES: así una tienda no muestra
// una grilla plana sino un recorrido por mundos de producto. Cubre dos rubros de
// vidriera: VELAS/deco (Velas · Aromas · Decoración · Accesorios) y PÁDEL (Palas ·
// Calzado · Pelotas · Bolsos · Grips y accesorios). Como `groupBySection` omite las
// secciones vacías, cada rubro sólo muestra las suyas y las del otro no aparecen: un
// único taxón compartido sin cruce (los vocabularios no colisionan — ver KIND_KEYWORDS).
// Apenas haya foto real, el halo se reemplaza por <Image>; el clasificador sigue sirviendo.
//
// DEUDA ANOTADA (Gate §3): la evolución "limpia" es un esquema de secciones POR RUBRO
// (variante ADR-055) inyectado desde el tenant/rubro, en vez de un taxón único. Se dejó
// aditivo y sin cambiar firmas a propósito (ventana "afinar", cambio reversible acotado
// al territorio de storefront-visual; no toca Storefront.tsx ni la página).

export type ProductKind =
  | "vela"
  | "difusor"
  | "textil"
  | "deco"
  | "accesorio"
  // pádel (rubro `padel` / A Dos Manos): vocabulario genérico del rubro, no marca del tenant.
  | "pala"
  | "calzado"
  | "pelota"
  | "bolso"
  | "equipo"
  | "generico";

// Familias de palabras por categoría (es-AR). El ORDEN es prioridad: la primera que
// matchea gana. `deco` va antes que `vela` para que "Portavela" (objeto deco) no caiga
// en velas por el substring "vela"; y en pádel `equipo` (protectores) va antes que
// `pala` para que "Protector de pala" no caiga en Palas. Los vocabularios de velas y
// pádel NO colisionan entre sí (verificado: ningún producto de un rubro matchea las
// palabras del otro), por eso conviven en una sola tabla.
const KIND_KEYWORDS: { kind: Exclude<ProductKind, "generico">; words: string[] }[] = [
  // deco primero: objetos de decoración para el hogar (incl. portavelas/portasahumerios).
  { kind: "deco", words: ["portavela", "porta vela", "portasahumerio", "florero", "jarron", "jarrón", "bandeja", "espejo", "cuadro", "lámina", "lamina", "maceta", "adorno", "macramé", "macrame", "guirnalda", "farol", "aromatizador de ambiente"] },
  { kind: "vela", words: ["vela", "velas", "candle", "cirio"] },
  { kind: "difusor", words: ["difusor", "difusores", "varilla", "varillas", "reed", "home spray", "sahumerio", "sahumerios", "incienso"] },
  { kind: "textil", words: ["textil", "textiles", "sabana", "sábana", "aromatizante de tela", "ropa"] },
  // accesorios: herramientas y complementos (sin el substring "vela" para no colisionar).
  { kind: "accesorio", words: ["mecha", "mechas", "cortamecha", "cortamechas", "apagador", "snuffer", "fósforo", "fosforo", "cerilla", "kit", "pabilo", "pinza"] },
  // --- Pádel (rubro `padel`) ---
  // `equipo` ANTES que `pala`: "Protector de pala", "grip", "overgrip", "muñequera" son
  // equipamiento, no palas, aunque contengan el substring "pala".
  { kind: "equipo", words: ["overgrip", "grip", "muñequera", "muñequeras", "protector", "antivibrador"] },
  { kind: "calzado", words: ["zapatilla", "zapatillas", "calzado"] },
  { kind: "pelota", words: ["pelota", "pelotas"] },
  { kind: "bolso", words: ["paletero", "mochila", "bolso", "bolsos"] },
  // `pala` al final del bloque de pádel: es la categoría más amplia del rubro.
  { kind: "pala", words: ["pala", "palas"] },
];

/** Clasifica un producto por su nombre. Case/acentos-insensible razonable. */
export function classifyProduct(name: string): ProductKind {
  const n = (name ?? "").toLowerCase();
  for (const { kind, words } of KIND_KEYWORDS) {
    if (words.some((w) => n.includes(w))) return kind;
  }
  return "generico";
}

// Glifo editorial por categoría (sobrio, no emoji): acompaña al halo. Cirio para
// velas, gotas para difusor, ondas para textil, rombo para deco, estrella para
// accesorios, punto para el resto.
const KIND_GLYPH: Record<ProductKind, string> = {
  vela: "❧",
  difusor: "❦",
  textil: "≈",
  deco: "❖",
  accesorio: "✦",
  // pádel — glifos sobrios y distintos entre sí y de los de velas.
  pala: "◗",
  calzado: "◄",
  pelota: "●",
  bolso: "▣",
  equipo: "✚",
  generico: "◦",
};

export function productGlyph(name: string): string {
  return KIND_GLYPH[classifyProduct(name)];
}

// --- Secciones del catálogo (recorrido experiencial) ------------------------

export type ProductSectionId =
  | "velas"
  | "aromas"
  | "decoracion"
  | "accesorios"
  // pádel
  | "palas"
  | "calzado"
  | "pelotas"
  | "bolsos"
  | "equipamiento"
  | "otros";

const KIND_TO_SECTION: Record<ProductKind, ProductSectionId> = {
  vela: "velas",
  difusor: "aromas",
  textil: "aromas",
  deco: "decoracion",
  accesorio: "accesorios",
  // pádel
  pala: "palas",
  calzado: "calzado",
  pelota: "pelotas",
  bolso: "bolsos",
  equipo: "equipamiento",
  generico: "otros",
};

/** Sección del catálogo a la que pertenece un producto (por su nombre). */
export function productSection(name: string): ProductSectionId {
  return KIND_TO_SECTION[classifyProduct(name)];
}

export interface SectionMeta {
  id: ProductSectionId;
  label: string;
  /** Bajada corta editorial (storytelling de la sección). */
  blurb: string;
}

// Orden de recorrido de la tienda. VELAS/deco primero (el corazón → aromas → deco →
// accesorios), luego PÁDEL (palas → calzado → pelotas → bolsos → equipamiento) y por
// último "otros" (catch-all). Cada rubro sólo puebla sus secciones; las del otro quedan
// vacías y `groupBySection` las omite, así ninguna tienda ve secciones ajenas.
export const PRODUCT_SECTIONS: SectionMeta[] = [
  // Velas & deco
  { id: "velas", label: "Velas", blurb: "Aromáticas, decorativas y artesanales — el corazón de tu ambiente." },
  { id: "aromas", label: "Aromas", blurb: "Difusores, sahumerios y textiles para perfumar cada rincón." },
  { id: "decoracion", label: "Decoración", blurb: "Objetos para el hogar que acompañan la luz y completan la escena." },
  { id: "accesorios", label: "Accesorios", blurb: "Los detalles del ritual: mechas, apagadores y fósforos largos." },
  // Pádel
  { id: "palas", label: "Palas", blurb: "El corazón de tu juego: potencia, control y todo lo que hay en el medio." },
  { id: "calzado", label: "Calzado", blurb: "Zapatillas con el agarre y la amortiguación que la pista te pide." },
  { id: "pelotas", label: "Pelotas", blurb: "Presión y durabilidad para que cada partido rinda de principio a fin." },
  { id: "bolsos", label: "Bolsos y paleteros", blurb: "Para llevar el equipo completo, prolijo y siempre a mano." },
  { id: "equipamiento", label: "Grips y accesorios", blurb: "Los detalles que cuidan tu pala y tu mano: grips, protectores y más." },
  { id: "otros", label: "Más productos", blurb: "" },
];

/**
 * Agrupa productos en secciones ordenadas (sólo las secciones no vacías). Genérico
 * sobre cualquier objeto con `name`. Puro → testeable.
 */
export function groupBySection<T extends { name: string }>(
  products: T[],
): { section: SectionMeta; items: T[] }[] {
  return PRODUCT_SECTIONS.map((section) => ({
    section,
    items: products.filter((p) => productSection(p.name) === section.id),
  })).filter((g) => g.items.length > 0);
}

/**
 * Filtra líneas de marketing (p. ej. `StorefrontCopy.vacioLines`) que declaran una
 * `section` opcional, dejando sólo las que tienen al menos 1 producto comprable en
 * esa sección — evita "anunciar" un mundo (Decoración/Accesorios) con góndola vacía
 * (QA m-1, 2026-07-07). Una línea sin `section` se muestra siempre (retrocompatible).
 * Genérico/estructural para no acoplar esta lógica pura al tipo `StorefrontLine`.
 */
export function linesWithStock<L extends { section?: ProductSectionId }, T extends { name: string }>(
  lines: L[],
  products: T[],
): L[] {
  const inStock = new Set(products.map((p) => productSection(p.name)));
  return lines.filter((l) => !l.section || inStock.has(l.section));
}

// --- Halo determinístico ----------------------------------------------------

// Hash determinístico y estable (djb2) del nombre → sirve para variar el ángulo
// del halo entre productos sin aleatoriedad (Math.random rompería SSR/CSR).
export function nameHash(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Desplazamiento de posición del halo (0–99 %) derivado del nombre. Determinístico:
 * dos productos distintos tienden a tener el halo en distinto lugar, el mismo
 * producto siempre igual. Puro → testeable.
 */
export function haloShift(name: string): number {
  return nameHash(name) % 100;
}

/**
 * Gradiente CSS del panel del producto, teñido con el acento del tenant
 * (`var(--accent)`) sobre la superficie elevada. El "shine": un halo cálido cuya
 * posición varía por producto. Devuelve un string listo para `background`.
 */
export function productGradient(name: string): string {
  const x = haloShift(name);
  const y = (haloShift(name + "·") >> 1) % 60; // segundo eje, también estable
  return (
    `radial-gradient(120% 120% at ${x}% ${y}%, ` +
    `color-mix(in srgb, var(--accent) 34%, var(--surface-raised)) 0%, ` +
    `color-mix(in srgb, var(--accent) 12%, var(--surface-raised)) 42%, ` +
    `var(--surface-raised) 100%)`
  );
}
