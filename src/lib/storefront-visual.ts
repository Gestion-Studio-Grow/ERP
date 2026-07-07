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
// La MISMA clasificación agrupa el catálogo en SECCIONES (Velas · Aromas · Decoración
// · Accesorios): así una tienda experiencial no muestra una grilla plana sino un
// recorrido por mundos de producto. Apenas haya foto real, el halo se reemplaza por
// <Image>; el clasificador/agrupador sigue sirviendo.

export type ProductKind = "vela" | "difusor" | "textil" | "deco" | "accesorio" | "generico";

// Familias de palabras por categoría (es-AR). El ORDEN es prioridad: `deco` va antes
// que `vela` a propósito para que "Portavela" (un objeto deco) no caiga en velas por
// contener el substring "vela". Los nombres del catálogo se eligen para no colisionar
// (los accesorios no incluyen "vela"; las velas decorativas sí son velas).
const KIND_KEYWORDS: { kind: Exclude<ProductKind, "generico">; words: string[] }[] = [
  // deco primero: objetos de decoración para el hogar (incl. portavelas/portasahumerios).
  { kind: "deco", words: ["portavela", "porta vela", "portasahumerio", "florero", "jarron", "jarrón", "bandeja", "espejo", "cuadro", "lámina", "lamina", "maceta", "adorno", "macramé", "macrame", "guirnalda", "farol", "aromatizador de ambiente"] },
  { kind: "vela", words: ["vela", "velas", "candle", "cirio"] },
  { kind: "difusor", words: ["difusor", "difusores", "varilla", "varillas", "reed", "home spray", "sahumerio", "sahumerios", "incienso"] },
  { kind: "textil", words: ["textil", "textiles", "sabana", "sábana", "aromatizante de tela", "ropa"] },
  // accesorios: herramientas y complementos (sin el substring "vela" para no colisionar).
  { kind: "accesorio", words: ["mecha", "mechas", "cortamecha", "cortamechas", "apagador", "snuffer", "fósforo", "fosforo", "cerilla", "kit", "pabilo", "pinza"] },
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
  generico: "◦",
};

export function productGlyph(name: string): string {
  return KIND_GLYPH[classifyProduct(name)];
}

// --- Secciones del catálogo (recorrido experiencial) ------------------------

export type ProductSectionId = "velas" | "aromas" | "decoracion" | "accesorios" | "otros";

const KIND_TO_SECTION: Record<ProductKind, ProductSectionId> = {
  vela: "velas",
  difusor: "aromas",
  textil: "aromas",
  deco: "decoracion",
  accesorio: "accesorios",
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

// Orden de recorrido de la tienda: primero las velas (el corazón), luego los aromas,
// después la decoración del hogar y por último los accesorios del ritual.
export const PRODUCT_SECTIONS: SectionMeta[] = [
  { id: "velas", label: "Velas", blurb: "Aromáticas, decorativas y artesanales — el corazón de tu ambiente." },
  { id: "aromas", label: "Aromas", blurb: "Difusores, sahumerios y textiles para perfumar cada rincón." },
  { id: "decoracion", label: "Decoración", blurb: "Objetos para el hogar que acompañan la luz y completan la escena." },
  { id: "accesorios", label: "Accesorios", blurb: "Los detalles del ritual: mechas, apagadores y fósforos largos." },
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
