// ============================================================================
// CADA MARCA EN LA VIDRIERA NUEVA — la estructura la pone la vidriera, la marca la pone el negocio.
// ============================================================================
//
// Qué cambia entre MAGRA, Shine, A Dos Manos y la genérica del rubro, en DATO (sin React, sin
// servidor): las secciones de la carta y cómo se reparte cada producto, cómo se dibuja cada
// sección, qué dice el envío sin tarifa, la entrega por defecto y las palabras. Los textos de
// marketing NO viven acá: salen del copy de cada marca (src/tenants/storefront.ts y
// magra-content.ts, este último textual y autorizado por el dueño).

import { productSection, PRODUCT_SECTIONS, type ProductSectionId } from "@/lib/storefront-visual";
import { normalizar } from "./catalogo-core";

export type MarcaId = "magra" | "shinevelas" | "adosmanos" | "generica";

/**
 * Cómo se dibuja una sección de la carta:
 *   · pizarra   — el pizarrón de MAGRA: foto chica, nombre, $/kg en la columna de la plata, «+»;
 *   · mundo     — Shine: la foto del mundo a la izquierda, los productos como renglones a la derecha;
 *   · cuadro    — A Dos Manos: tabla comparable (modelo · marca · precio), ordenable;
 *   · lista     — renglones a dos columnas (accesorios, genérica).
 */
export type Disposicion = "pizarra" | "mundo" | "cuadro" | "lista";

export type SeccionDeMarca = { id: string; titulo: string; disposicion: Disposicion };

export type Palabras = {
  /** Singular y plural de lo que se vende ("corte"/"cortes", "producto"/"productos"). */
  uno: string;
  varios: string;
  buscar: string;
  /** Título de la carta en la vidriera ("La carta de hoy", "La colección"). */
  carta: string;
  /** Lo que dice la bolsa vacía. */
  bolsaVacia: string;
  notaPlaceholder: string;
};

export type ConfigDeMarca = {
  id: MarcaId;
  secciones: SeccionDeMarca[];
  palabras: Palabras;
  /** Sin tarifa de envío cargada: ¿el local no cobra el envío, o se arregla aparte? */
  envioSinTarifa: "sin-cargo" | "a-coordinar";
  entregaPorDefecto: "PICKUP" | "DELIVERY";
  /** El filtro por marca (pádel): la marca sale del nombre, con la lista de marcas del copy. */
  filtroPorMarca: boolean;
};

// ── MAGRA: vaca, cerdo, pollo y gourmet ─────────────────────────────────────
//
// Las cuatro secciones de la carta de MAGRA (las mismas de su sitio y de "Envasados al vacío").
// El catálogo no tiene categoría, así que se decide por el nombre, con reglas chicas y probadas:
// lo gourmet (lo que no es carne), el cerdo, el pollo; el resto es vaca, que es casi toda la carta.

const MAGRA_GOURMET = /\b(ensalada|merluza|pescado|salmon|sorrentino|raviol|pasta|salsa|conserva|queso|verdura|vegetal)/;
const MAGRA_CERDO = /\b(cerdo|bondiola|pechito|carre)\b/;
const MAGRA_POLLO = /\b(pollo|pechuga|suprema|muslo|pata)\b/;

export function seccionMagra(nombre: string): "vaca" | "cerdo" | "pollo" | "gourmet" {
  const n = normalizar(nombre);
  if (MAGRA_GOURMET.test(n)) return "gourmet";
  if (MAGRA_CERDO.test(n)) return "cerdo";
  if (MAGRA_POLLO.test(n)) return "pollo";
  return "vaca";
}

// ── A DOS MANOS: palas, zapatillas y lo demás ──────────────────────────────

export function seccionPadel(nombre: string): "palas" | "calzado" | "accesorios" {
  const s = productSection(nombre);
  if (s === "palas") return "palas";
  if (s === "calzado") return "calzado";
  return "accesorios";
}

// ── SHINE y la genérica: las secciones de storefront-visual ─────────────────

const TITULO_VISUAL = new Map(PRODUCT_SECTIONS.map((s) => [s.id, s.label]));

export const CONFIG: Record<MarcaId, ConfigDeMarca> = {
  magra: {
    id: "magra",
    secciones: [
      { id: "vaca", titulo: "Vaca", disposicion: "pizarra" },
      { id: "cerdo", titulo: "Cerdo", disposicion: "pizarra" },
      { id: "pollo", titulo: "Pollo orgánico", disposicion: "pizarra" },
      { id: "gourmet", titulo: "Gourmet", disposicion: "pizarra" },
    ],
    palabras: {
      uno: "corte",
      varios: "cortes",
      buscar: "Buscar un corte",
      carta: "La carta de hoy",
      bolsaVacia: "Sumá cortes con el «+». Pedís por kilo o por pieza: se pesa al envasar.",
      notaPlaceholder: "Punto de cocción, cómo lo querés cortado, horario…",
    },
    // MAGRA no tiene tarifa: el servidor no suma envío (pedido-online.test.ts). Que eso sea
    // «gratis» para siempre es decisión del dueño; hoy es lo que el sistema cobra.
    envioSinTarifa: "sin-cargo",
    entregaPorDefecto: "DELIVERY",
    filtroPorMarca: false,
  },
  shinevelas: {
    id: "shinevelas",
    secciones: (["velas", "aromas", "decoracion", "accesorios"] as ProductSectionId[]).map((id) => ({
      id,
      titulo: TITULO_VISUAL.get(id) ?? id,
      disposicion: "mundo" as const,
    })),
    palabras: {
      uno: "producto",
      varios: "productos",
      buscar: "Buscar en la colección",
      carta: "La colección",
      bolsaVacia: "Sumá productos con el «+» y armá tu ambiente.",
      notaPlaceholder: "Aroma preferido, si es para regalo…",
    },
    envioSinTarifa: "a-coordinar",
    entregaPorDefecto: "DELIVERY",
    filtroPorMarca: false,
  },
  adosmanos: {
    id: "adosmanos",
    secciones: [
      { id: "palas", titulo: "Palas", disposicion: "cuadro" },
      { id: "calzado", titulo: "Zapatillas", disposicion: "cuadro" },
      { id: "accesorios", titulo: "Pelotas y accesorios", disposicion: "lista" },
    ],
    palabras: {
      uno: "producto",
      varios: "productos",
      buscar: "Buscar pala, zapatilla o marca",
      carta: "El cuadro de palas",
      bolsaVacia: "Sumá lo que quieras con el «+». Te confirmamos stock y talle antes de cobrar.",
      notaPlaceholder: "Talle, nivel de juego, dudas…",
    },
    // Sin tarifa cargada y con envíos a todo el país: el envío se arregla aparte. No se dice gratis.
    envioSinTarifa: "a-coordinar",
    entregaPorDefecto: "PICKUP",
    filtroPorMarca: true,
  },
  generica: {
    id: "generica",
    secciones: PRODUCT_SECTIONS.map((s) => ({ id: s.id, titulo: s.label, disposicion: "lista" as const })),
    palabras: {
      uno: "producto",
      varios: "productos",
      buscar: "Buscar",
      carta: "Productos",
      bolsaVacia: "Sumá lo que quieras con el «+».",
      notaPlaceholder: "Aclaraciones del pedido",
    },
    envioSinTarifa: "a-coordinar",
    entregaPorDefecto: "PICKUP",
    filtroPorMarca: false,
  },
};

/** La sección de un producto en la carta de esta marca. */
export function seccionDe(marca: MarcaId, nombre: string): string {
  if (marca === "magra") return seccionMagra(nombre);
  if (marca === "adosmanos") return seccionPadel(nombre);
  return productSection(nombre);
}

/** La marca de la vidriera nueva según el front editorial del negocio (identidad-rubro). */
export function marcaDeLaVidriera(front: string | null | undefined, brandId: string | null | undefined): MarcaId {
  if (front === "magra") return "magra";
  if (front === "shinevelas") return "shinevelas";
  if (brandId === "adosmanos") return "adosmanos";
  return "generica";
}

/**
 * ¿Este pedido ve la vidriera nueva? Sólo con el interruptor «Diseño nuevo» del negocio prendido, y
 * sólo si el negocio es de mostrador o tiene marca de tienda. CH (servicios: sin rubro de mostrador,
 * sin marca de tienda) sigue con la de siempre en /tienda y /tienda/gracias aunque lo prendan.
 */
export function usaVidrieraNueva(
  nuevo: boolean,
  identidad: { isRetail: boolean; brandId: string | null },
  front: string | null,
): boolean {
  return nuevo && (identidad.isRetail || Boolean(front) || Boolean(identidad.brandId));
}
