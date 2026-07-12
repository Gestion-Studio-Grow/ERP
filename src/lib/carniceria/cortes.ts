// ============================================================================
// Carnicería — clasificación de CORTES por categoría (LÓGICA PURA, testeable).
// ============================================================================
//
// El Core no guarda todavía una `category` en `Product` (eso es Gate 2, ver
// docs/preventa/magra/backoffice-carniceria-spec.md §1). Mientras tanto, el
// backoffice agrupa el catálogo de una carnicería por su GÓNDOLA real —vaca,
// cerdo, pollo, preparados, gourmet— derivándola de forma DETERMINÍSTICA del
// nombre del corte (mismo nombre → misma categoría, estable entre renders).
//
// Es el análogo de `storefront-visual.classifyProduct` pero para el rubro carne y
// para el PANEL (no la vidriera): un mostrador no vende "productos genéricos", vende
// cortes ordenados por animal. Cuando exista `Product.category`, este clasificador
// pasa a ser el FALLBACK (categoría explícita → este derivado), un único punto de
// cambio. Puro respecto de la DB → se testea sin levantar nada.

export type CorteCategoria = "vaca" | "cerdo" | "pollo" | "achuras" | "preparados" | "gourmet" | "otros";

// Familias de palabras por categoría (es-AR). El ORDEN es prioridad: la primera que
// matchea gana. `preparados` va ANTES que las carnes crudas para que "Hamburguesas
// caseras" o "Milanesas de nalga" (elaborados) no caigan en vaca por "nalga"/"carne";
// `gourmet` va antes que `pollo`/`pescado` para que la línea de almacén no se mezcle.
const CATEGORIA_KEYWORDS: { categoria: Exclude<CorteCategoria, "otros">; words: string[] }[] = [
  // Preparados / elaborados de la casa: primero, para ganarle a la carne cruda.
  {
    categoria: "preparados",
    words: [
      "hamburguesa", "medallon", "medallón", "milanesa", "milanesas", "empanada",
      "chorizo", "morcilla", "salchicha", "matambre relleno", "pan de carne",
      "brochette", "bondiola adobada", "pinchos", "albondiga", "albóndiga",
    ],
  },
  // Achuras / menudencias (parte central de la taxonomía real de MAGRA en Bistrosoft:
  // categoría "ACHURAS"). Antes que cerdo/vaca para que no las absorban.
  {
    categoria: "achuras",
    words: [
      "molleja", "mollejas", "chinchulin", "chinchulín", "chinchulines", "riñon", "riñón",
      "riñones", "hígado", "higado", "lengua", "seso", "sesos", "tripa gorda", "corazon", "corazón",
      "achura", "achuras", "mondongo",
    ],
  },
  // Cerdo.
  {
    categoria: "cerdo",
    words: [
      "cerdo", "bondiola", "pechito", "solomillo de cerdo", "carré", "carre",
      "matambre de cerdo", "costilla de cerdo", "panceta", "lechon", "lechón",
    ],
  },
  // Pollo / ave.
  {
    categoria: "pollo",
    words: [
      "pollo", "pechuga", "pata muslo", "pata-muslo", "muslo", "suprema", "ave",
      "alita", "alitas", "menudos",
    ],
  },
  // Gourmet / almacén premium (la línea que acompaña, no es carne de mostrador).
  {
    categoria: "gourmet",
    // OJO: sin "picada" — "Carne picada" es vacuno, no una tabla de picada; dejarlo
    // acá la robaba a Vaca (gourmet corre antes). La tabla de fiambres usa "tabla".
    words: [
      "sorrentino", "sorrentinos", "pasta", "ravioles", "salsa", "ensalada",
      "conserva", "merluza", "pescado", "salmon", "salmón", "langostino",
      "queso", "fiambre", "tabla", "aceite", "vino", "provoleta",
    ],
  },
  // Vaca / vacuno: la categoría más amplia del rubro → al final del bloque de carnes.
  {
    categoria: "vaca",
    words: [
      "lomo", "ojo de bife", "bife", "entraña", "entrana", "cuadril", "colita",
      "asado", "vacío", "vacio", "nalga", "picada", "roast beef", "peceto",
      "tapa de asado", "matambre", "aguja", "paleta", "osobuco", "falda",
      "carne", "vaca", "vacuno", "angus", "novillo", "ternera",
    ],
  },
];

/** Clasifica un corte por su nombre. Case/acentos-insensible razonable. */
export function classifyCorte(name: string): CorteCategoria {
  const n = (name ?? "").toLowerCase();
  // Guard de dominio: cualquier "bife …" es un corte vacuno (bife de chorizo, bife
  // angosto, bife ancho), aunque contenga "chorizo" (que en preparados es el embutido).
  if (n.includes("bife")) return "vaca";
  for (const { categoria, words } of CATEGORIA_KEYWORDS) {
    if (words.some((w) => n.includes(w))) return categoria;
  }
  return "otros";
}

export interface CategoriaMeta {
  id: CorteCategoria;
  /** Etiqueta de la góndola en el panel. */
  label: string;
  /** Glifo sobrio (no emoji) para acompañar el encabezado de la góndola. */
  glyph: string;
}

// Orden de recorrido del mostrador: vaca (el fuerte) → cerdo → pollo → preparados →
// gourmet → otros (catch-all). Igual criterio que `PRODUCT_SECTIONS` de la vidriera.
export const CORTE_CATEGORIAS: CategoriaMeta[] = [
  { id: "vaca", label: "Vaca", glyph: "❶" },
  { id: "cerdo", label: "Cerdo", glyph: "❷" },
  { id: "pollo", label: "Pollo", glyph: "❸" },
  { id: "achuras", label: "Achuras", glyph: "❹" },
  { id: "preparados", label: "Preparados", glyph: "❺" },
  { id: "gourmet", label: "Gourmet", glyph: "❻" },
  { id: "otros", label: "Otros", glyph: "◦" },
];

const CATEGORIA_BY_ID: Record<CorteCategoria, CategoriaMeta> = Object.fromEntries(
  CORTE_CATEGORIAS.map((c) => [c.id, c]),
) as Record<CorteCategoria, CategoriaMeta>;

export function categoriaMeta(id: CorteCategoria): CategoriaMeta {
  return CATEGORIA_BY_ID[id];
}

/**
 * Agrupa cortes en categorías ordenadas (sólo las no vacías). Genérico sobre
 * cualquier objeto con `name`. Puro → testeable.
 */
export function groupCortesByCategoria<T extends { name: string }>(
  cortes: T[],
): { categoria: CategoriaMeta; items: T[] }[] {
  return CORTE_CATEGORIAS.map((categoria) => ({
    categoria,
    items: cortes.filter((c) => classifyCorte(c.name) === categoria.id),
  })).filter((g) => g.items.length > 0);
}

// --- Margen por corte -------------------------------------------------------

export interface Margen {
  /** Ganancia bruta por unidad de venta (precio − costo), en $. */
  gananciaUnit: number;
  /** Margen sobre el precio de venta, 0–1 (ej 0.35 = 35 %). */
  pct: number;
  /** Semáforo para la UI: rojo < 20 %, ámbar 20–35 %, verde ≥ 35 %. */
  tone: "danger" | "warning" | "success";
}

/**
 * Margen de un corte a partir de su precio de venta vigente (por kg o por unidad)
 * y su último costo conocido (de la última compra). Devuelve `null` si falta el
 * costo o el precio (no se puede calcular) → la UI muestra "—", no un 0 engañoso.
 * Es donde se gana o se pierde plata en carnicería: el dueño ve, corte por corte,
 * cuánto le rinde.
 */
export function margenCorte(sellPrice: number | null | undefined, cost: number | null | undefined): Margen | null {
  if (!sellPrice || sellPrice <= 0) return null;
  if (cost == null || cost <= 0) return null;
  const gananciaUnit = sellPrice - cost;
  const pct = gananciaUnit / sellPrice;
  const tone: Margen["tone"] = pct < 0.2 ? "danger" : pct < 0.35 ? "warning" : "success";
  return { gananciaUnit, pct, tone };
}
