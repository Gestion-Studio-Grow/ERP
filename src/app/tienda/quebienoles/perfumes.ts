// ============================================================================
// QUÉ BIEN OLÉS — el catálogo como lo publica la marca, más la ficha de cada perfume.
// ============================================================================
//
// DATO PURO (sin React, sin Prisma): lo leen la vidriera, el recomendador y el script que carga el
// catálogo en la base (scripts/tenants/quebienoles-catalogo.ts). Una sola fuente para las tres.
//
// Qué vale y de dónde sale:
//   · FAMILIAS, nombres y precios: el carrusel del 15/09/2026 de @quebienoles
//     (instagram.com/quebienoles/p/DdUdq_BlpYZ, 5 placas). El precio de acá es la SEMILLA de la
//     carga: el precio vivo es el de la base, que el dueño cambia desde el panel.
//   · Casa, acordes y pirámide: Fragrantica (URL por perfume en `fuente`). Es la ficha del perfume
//     de la casa, no algo que Qué Bien Olés haya dicho: por eso cada uno lleva su fuente.
//   · Lo que NO se afirma queda en null, con el motivo al lado. En la vidriera, null es "consultanos",
//     nunca un dato de relleno.
//
// La base no tiene columna de categoría ni de imagen (el catálogo del ERP es nombre + precio): la
// ficha se encuentra por NOMBRE, con la misma normalización del resto de las vidrieras. Si el dueño
// suma un perfume desde el panel, aparece igual, en "Más fragancias", sin pirámide ni foto propia.

import { normalizar } from "../vidriera/catalogo-core";

export type FamiliaId = "dulces" | "frescos" | "versatiles" | "femeninos";

export type Familia = {
  id: FamiliaId;
  /** "Dulces" — como la nombra la portada del carrusel. */
  nombre: string;
  /** "de noche" — la bajada corta de la portada. */
  cuando: string;
  /** "Más dulces" — el título de su placa. */
  titulo: string;
  /** "Intensos, adictivos, de noche." — la bajada de su placa. */
  bajada: string;
  /** Color del líquido del frasco 3D y del acento de la familia. */
  color: string;
  icono: "caramelo" | "citrico" | "corbata" | "ella";
};

// El orden es el de la portada del carrusel: dulces, frescos, versátiles, femeninos.
export const FAMILIAS: readonly Familia[] = [
  { id: "dulces", nombre: "Dulces", cuando: "de noche", titulo: "Más dulces", bajada: "Intensos, adictivos, de noche.", color: "#c9793f", icono: "caramelo" },
  { id: "frescos", nombre: "Frescos", cuando: "día a día", titulo: "Más frescos", bajada: "Energía, elegancia, todos los días.", color: "#6fc7b8", icono: "citrico" },
  { id: "versatiles", nombre: "Versátiles", cuando: "para todo", titulo: "Versátiles", bajada: "Para cualquier ocasión.", color: "#8aa3dc", icono: "corbata" },
  { id: "femeninos", nombre: "Femeninos", cuando: "ellas eligen", titulo: "Femeninos", bajada: "Elegancia en cada detalle.", color: "#e295b4", icono: "ella" },
];

export const FAMILIA_POR_ID: Readonly<Record<FamiliaId, Familia>> = Object.fromEntries(
  FAMILIAS.map((f) => [f.id, f]),
) as Record<FamiliaId, Familia>;

export type Genero = "femenino" | "masculino" | "unisex";

export type Piramide = { salida: string[]; corazon: string[]; fondo: string[] };

export type Perfume = {
  /** Clave estable: nombre de la foto (/tenants/quebienoles/perfumes/<clave>.jpg) y código del catálogo. */
  clave: string;
  /** Como lo publica Qué Bien Olés ("Khamrah", "Yara Pink"). */
  nombre: string;
  /** Casa que lo fabrica, según su ficha. null = no se afirma (ver el motivo en `aviso`). */
  casa: string | null;
  familia: FamiliaId;
  /** Precio de la placa del 15/09/2026 (ARS). Semilla de la carga; el vivo es el de la base. */
  precio: number;
  genero: Genero | null;
  concentracion: string | null;
  acordes: readonly string[];
  notas: Piramide | null;
  /** Ficha pública del perfume (Fragrantica). */
  fuente: string | null;
  /** Otros nombres con los que puede quedar cargado en la base. */
  alias?: readonly string[];
  /** Lo que la vidriera tiene que decir antes de que alguien lo pida. */
  aviso?: string;
};

const FRAGRANTICA = "https://www.fragrantica.com/perfume/";

export const PERFUMES: readonly Perfume[] = [
  // ── MÁS DULCES — "Intensos, adictivos, de noche" ─────────────────────────
  {
    clave: "dul-9pm-night-out", nombre: "9PM Night Out", casa: "Afnan", familia: "dulces", precio: 47000,
    genero: "unisex", concentracion: "Extrait de Parfum",
    acordes: ["Amaderado", "Frutal", "Especiado cálido", "Dulce"],
    notas: { salida: ["Pitahaya", "Coñac", "Lavanda", "Manzana", "Bergamota"], corazon: ["Toffee", "Gamuza", "Cardamomo", "Cedro"], fondo: ["Haba tonka", "Akigalawood", "Ambrofix", "Pachulí"] },
    fuente: `${FRAGRANTICA}Afnan/9-PM-Night-Out-123313.html`,
  },
  {
    clave: "dul-khamrah", nombre: "Khamrah", casa: "Lattafa", familia: "dulces", precio: 45000,
    genero: "unisex", concentracion: "Eau de Parfum",
    acordes: ["Dulce", "Especiado cálido", "Vainilla", "Ámbar"],
    notas: { salida: ["Canela", "Nuez moscada", "Bergamota"], corazon: ["Dátiles", "Praliné", "Nardo"], fondo: ["Vainilla", "Haba tonka", "Madera ambarina", "Mirra", "Benjuí"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Khamrah-75805.html`,
  },
  {
    clave: "dul-liquid-brun", nombre: "Liquid Brun", casa: "French Avenue", familia: "dulces", precio: 49000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Dulce", "Especiado cálido", "Vainilla", "Canela"],
    notas: { salida: ["Canela", "Flor de azahar", "Cardamomo", "Bergamota"], corazon: ["Vainilla bourbon", "Elemí"], fondo: ["Praliné", "Ambroxan", "Almizcle", "Madera de guayaco"] },
    fuente: `${FRAGRANTICA}French-Avenue/Liquid-Brun-94713.html`,
  },
  {
    clave: "dul-yara-candy", nombre: "Yara Candy", casa: "Lattafa", familia: "dulces", precio: 32000,
    genero: "femenino", concentracion: "Eau de Parfum",
    acordes: ["Vainilla", "Frutal", "Polvoroso", "Cítrico"],
    notas: { salida: ["Mandarina verde", "Grosella negra"], corazon: ["Caramelo de frutilla", "Gardenia"], fondo: ["Vainilla", "Almizcle", "Ámbar", "Sándalo"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Yara-Candy-95752.html`,
  },
  {
    clave: "dul-give-me-gourmand", nombre: "Give Me Gourmand", casa: "Lattafa", familia: "dulces", precio: 45000,
    genero: "femenino", concentracion: "Eau de Parfum",
    acordes: ["Dulce", "Lácteo", "Vainilla", "Cacao"],
    notas: { salida: ["Cacao", "Manteca"], corazon: ["Galletita", "Leche", "Azúcar"], fondo: ["Vainilla", "Crema batida", "Sándalo"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Cookie-Crave-114399.html`,
    alias: ["Cookie Crave"],
  },
  {
    clave: "dul-asad-bourbon", nombre: "Asad Bourbon", casa: "Lattafa", familia: "dulces", precio: 32000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Vainilla", "Cacao", "Dulce", "Lavanda"],
    notas: { salida: ["Lavanda", "Ciruela mirabel", "Pimienta rosa"], corazon: ["Cacao", "Nuez moscada", "Davana"], fondo: ["Vainilla bourbon", "Ámbar", "Vetiver"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Asad-Bourbon-101124.html`,
  },
  {
    clave: "dul-cocoa-morado", nombre: "Cocoa Morado", casa: "French Avenue", familia: "dulces", precio: 38000,
    genero: "unisex", concentracion: "Eau de Parfum",
    acordes: ["Ámbar", "Especiado cálido", "Dulce", "Vainilla"],
    notas: { salida: ["Pimienta rosa", "Cardamomo", "Canela", "Azafrán"], corazon: ["Caña de azúcar", "Oud", "Incienso", "Caramelo"], fondo: ["Vainilla de Madagascar", "Manteca de cacao", "Pachulí", "Cuero"] },
    fuente: `${FRAGRANTICA}French-Avenue/Cocoa-Morado-98886.html`,
  },

  // ── MÁS FRESCOS — "Energía, elegancia, todos los días" ────────────────────
  {
    clave: "fre-odyssey-limoni", nombre: "Odyssey Limoni", casa: "Armaf", familia: "frescos", precio: 37000,
    genero: "unisex", concentracion: "Eau de Parfum",
    acordes: ["Cítrico", "Especiado fresco", "Aromático", "Fresco"],
    notas: { salida: ["Limón", "Naranja dulce", "Mandarina", "Bergamota"], corazon: ["Flor de azahar", "Notas marinas", "Jengibre"], fondo: ["Té", "Almizcle", "Ámbar"] },
    fuente: `${FRAGRANTICA}Armaf/Odyssey-Limoni-Fresh-98695.html`,
  },
  {
    // Fragrantica la ficha como "Club de Nuit Blue Iconic"; el frasco de la placa es ése.
    clave: "fre-cdn-iconic", nombre: "Club de Nuit Iconic", casa: "Armaf", familia: "frescos", precio: 46000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Cítrico", "Amaderado", "Especiado fresco", "Ámbar"],
    notas: { salida: ["Pomelo", "Limón", "Menta", "Pimienta rosa"], corazon: ["Jengibre", "Melón", "Jazmín", "Nuez moscada"], fondo: ["Incienso", "Sándalo", "Cedro", "Ámbar"] },
    fuente: `${FRAGRANTICA}Armaf/Club-de-Nuit-Blue-Iconic-78475.html`,
    alias: ["Club de Nuit Blue Iconic", "CDN Iconic"],
  },
  {
    clave: "fre-hawas-ice", nombre: "Hawas Ice", casa: "Rasasi", familia: "frescos", precio: 34000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Frutal", "Cítrico", "Dulce", "Fresco"],
    notas: { salida: ["Manzana", "Limón", "Bergamota", "Anís estrellado"], corazon: ["Ciruela", "Flor de azahar", "Cardamomo"], fondo: ["Almizcle", "Ámbar", "Madera de deriva", "Musgo"] },
    fuente: `${FRAGRANTICA}Rasasi/Hawas-Ice-89050.html`,
  },
  {
    clave: "fre-9am-dive", nombre: "9AM Dive", casa: "Afnan", familia: "frescos", precio: 35000,
    genero: "unisex", concentracion: "Eau de Parfum",
    acordes: ["Acuático", "Cítrico", "Aromático", "Frutal"],
    notas: { salida: ["Limón", "Pimienta rosa", "Menta", "Grosella negra"], corazon: ["Manzana", "Incienso", "Cedro"], fondo: ["Pachulí", "Jazmín", "Jengibre", "Sándalo"] },
    fuente: `${FRAGRANTICA}Afnan/9am-Dive-78611.html`,
  },
  {
    clave: "fre-odyssey-mandarin-sky", nombre: "Odyssey Mandarin Sky", casa: "Armaf", familia: "frescos", precio: 37000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Cítrico", "Dulce", "Aromático", "Amaderado"],
    notas: { salida: ["Mandarina", "Naranja", "Azafrán", "Salvia"], corazon: ["Caramelo", "Haba tonka", "Caléndula"], fondo: ["Ambroxan", "Cedro", "Vetiver"] },
    fuente: `${FRAGRANTICA}Armaf/Odyssey-Mandarin-Sky-83132.html`,
  },
  {
    clave: "fre-hawas-tropical", nombre: "Hawas Tropical", casa: "Rasasi", familia: "frescos", precio: 34000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Dulce", "Verde", "Coco", "Amaderado"],
    notas: { salida: ["Agua de coco", "Hoja de higuera", "Jengibre"], corazon: ["Coco", "Higo", "Menta"], fondo: ["Sándalo", "Haba tonka", "Almizcle"] },
    fuente: `${FRAGRANTICA}Rasasi/Hawas-Tropical-108054.html`,
  },

  // ── VERSÁTILES — "Para cualquier ocasión" ─────────────────────────────────
  {
    clave: "ver-9pm", nombre: "9PM", casa: "Afnan", familia: "versatiles", precio: 35000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Vainilla", "Especiado cálido", "Dulce", "Ámbar"],
    notas: { salida: ["Bergamota", "Lavanda", "Canela", "Manzana"], corazon: ["Azahar", "Muguete"], fondo: ["Pachulí", "Ámbar", "Vainilla", "Haba tonka"] },
    fuente: `${FRAGRANTICA}Afnan/9pm-65414.html`,
  },
  {
    clave: "ver-cdn-intense-man", nombre: "Club de Nuit Intense Man", casa: "Armaf", familia: "versatiles", precio: 40000,
    genero: "masculino", concentracion: "Eau de Toilette",
    acordes: ["Dulce", "Amaderado", "Floral", "Frutal"],
    notas: { salida: ["Limón", "Bergamota", "Ananá", "Grosella negra", "Manzana"], corazon: ["Abedul", "Jazmín", "Rosa"], fondo: ["Ámbar gris", "Almizcle", "Vainilla", "Pachulí"] },
    fuente: `${FRAGRANTICA}Armaf/Club-de-Nuit-Intense-Man-34696.html`,
    alias: ["CDN Intense Man"],
  },
  {
    clave: "ver-supremacy-collector", nombre: "Supremacy Collector's Edition", casa: "Afnan", familia: "versatiles", precio: 44000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Frutal", "Chipre", "Floral", "Almizclado"],
    notas: { salida: ["Ananá", "Bergamota", "Manzana", "Flores blancas"], corazon: ["Azahar", "Abedul", "Ámbar"], fondo: ["Musgo de roble", "Almizcle", "Ámbar gris"] },
    fuente: `${FRAGRANTICA}Afnan/Supremacy-Collector-s-Edition-Pour-Homme-98689.html`,
    alias: ["Afnan Supremacy", "Supremacy"],
  },
  {
    // [CONTRADICTORIO] La pirámide de Fragrantica (naranja/bayas/vainilla) no coincide con la del
    // sitio oficial de Bharara (ron/tabaco). Hasta que el dueño confirme cuál es el que vende, no se
    // publica ninguna: se muestra "pedinos la ficha".
    clave: "ver-bharara-bleu", nombre: "Bharara Bleu", casa: "Bharara", familia: "versatiles", precio: 59000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: [],
    notas: null,
    fuente: null,
  },
  {
    clave: "ver-bharara-king", nombre: "Bharara King Gold Edition", casa: "Bharara", familia: "versatiles", precio: 59000,
    genero: "masculino", concentracion: "Eau de Parfum",
    acordes: ["Oriental", "Vainilla", "Cítrico", "Ámbar"],
    notas: { salida: ["Naranja dulce", "Bergamota", "Limón"], corazon: ["Frutos rojos", "Coco"], fondo: ["Vainilla", "Ámbar", "Almizcle blanco"] },
    fuente: `${FRAGRANTICA}Bharara/King-Gold-Edition-125451.html`,
    alias: ["Bharara King", "Bharara Gold Edition", "Gold Edition King"],
  },
  {
    clave: "ver-amber-oud-aqua-dubai", nombre: "Amber Oud Aqua Dubai", casa: "Al Haramain", familia: "versatiles", precio: 54000,
    genero: "unisex", concentracion: "Extrait de Parfum",
    acordes: ["Aromático", "Frutal", "Ambarado", "Almizclado"],
    notas: { salida: ["Notas verdes", "Bergamota", "Mandarina"], corazon: ["Melón", "Ámbar", "Grosella negra", "Ananá"], fondo: ["Almizcle", "Petitgrain", "Gálbano", "Vainilla"] },
    fuente: `${FRAGRANTICA}Al-Haramain-Perfumes/Amber-Oud-Aqua-Dubai-96482.html`,
    alias: ["Al Haramain Aqua Dubai", "Aqua Dubai"],
  },

  // ── FEMENINOS — "Elegancia en cada detalle" ───────────────────────────────
  {
    clave: "fem-yara", nombre: "Yara Pink", casa: "Lattafa", familia: "femeninos", precio: 32000,
    genero: "femenino", concentracion: "Eau de Parfum",
    acordes: ["Vainilla", "Dulce", "Frutal", "Gourmand"],
    notas: { salida: ["Orquídea", "Heliotropo", "Mandarina"], corazon: ["Acorde gourmand", "Frutas tropicales"], fondo: ["Vainilla", "Almizcle", "Sándalo"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Yara-76880.html`,
    alias: ["Yara"],
  },
  {
    // [A VALIDAR] La placa muestra el frasco de Lancôme a $20.000: a ese precio no puede ser el
    // original de 100 ml. No se afirma casa ni pirámide hasta que el dueño diga qué presentación es.
    clave: "fem-la-vie-est-belle", nombre: "La Vida es Bella", casa: null, familia: "femeninos", precio: 20000,
    genero: "femenino", concentracion: null,
    acordes: [],
    notas: null,
    fuente: null,
    alias: ["La vie est belle"],
    aviso: "Consultanos la presentación antes de pedirlo.",
  },
  {
    clave: "fem-eclaire", nombre: "Eclaire", casa: "Lattafa", familia: "femeninos", precio: 39000,
    genero: "femenino", concentracion: "Eau de Parfum",
    acordes: ["Dulce", "Vainilla", "Gourmand", "Floral"],
    notas: { salida: ["Caramelo", "Leche", "Azúcar"], corazon: ["Miel", "Flores blancas"], fondo: ["Vainilla", "Praliné", "Almizcle"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Eclaire-93628.html`,
  },
  {
    // [A VALIDAR] Mismo caso que La Vida es Bella: frasco de Kayali a $25.000.
    clave: "fem-kayali-vanilla-candy", nombre: "Kayali Vanilla Candy", casa: null, familia: "femeninos", precio: 25000,
    genero: "femenino", concentracion: null,
    acordes: [],
    notas: null,
    fuente: null,
    alias: ["Vanilla Candy", "Vanilla Candy Rock Sugar"],
    aviso: "Consultanos la presentación antes de pedirlo.",
  },
  {
    clave: "fem-sakeena", nombre: "Sakeena", casa: "Lattafa", familia: "femeninos", precio: 38000,
    genero: "femenino", concentracion: "Eau de Parfum",
    acordes: ["Frutal", "Dulce", "Floral", "Tropical"],
    notas: { salida: ["Maracuyá", "Mandarina", "Notas ozónicas"], corazon: ["Frambuesa", "Rosa", "Azahar"], fondo: ["Praliné", "Toffee", "Almizcle", "Vainilla"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Sakeena-85094.html`,
  },
  {
    clave: "fem-afeef", nombre: "Afeef", casa: "Lattafa", familia: "femeninos", precio: 59000,
    genero: "unisex", concentracion: "Eau de Parfum",
    acordes: ["Dulce", "Floral", "Frutal", "Amaderado"],
    notas: { salida: ["Durazno", "Pimienta rosa", "Bergamota"], corazon: ["Nardo", "Azahar", "Jazmín"], fondo: ["Praliné", "Ámbar", "Sándalo", "Pachulí"] },
    fuente: `${FRAGRANTICA}Lattafa-Perfumes/Afeef-100126.html`,
  },
];

/** Cómo queda el nombre en la base: "Khamrah · Lattafa" (la casa al lado, si no está ya en el nombre). */
export function nombreEnCatalogo(p: Pick<Perfume, "nombre" | "casa">): string {
  if (!p.casa || normalizar(p.nombre).includes(normalizar(p.casa))) return p.nombre;
  return `${p.nombre} · ${p.casa}`;
}

/** "Khamrah · Lattafa" → "Khamrah"; "Bharara Bleu" → "Bharara Bleu". Lo que va antes del punto medio. */
export function nombreSinCasa(nombre: string): string {
  return nombre.split(/\s+[·|—-]\s+/)[0].trim();
}

export function fotoDe(p: Pick<Perfume, "clave">): string {
  return `/tenants/quebienoles/perfumes/${p.clave}.jpg`;
}

const INDICE: ReadonlyMap<string, Perfume> = (() => {
  const m = new Map<string, Perfume>();
  for (const p of PERFUMES) {
    for (const n of [p.nombre, nombreEnCatalogo(p), ...(p.alias ?? [])]) m.set(normalizar(n), p);
  }
  return m;
})();

/**
 * La ficha del perfume que corresponde a un producto de la base, por nombre. Primero el nombre
 * entero ("Khamrah · Lattafa"), después sin la casa ("Khamrah"). Sin match → null (el producto se
 * muestra igual, sin ficha: no se le inventa familia).
 */
export function perfumeDe(nombreEnBase: string): Perfume | null {
  return INDICE.get(normalizar(nombreEnBase)) ?? INDICE.get(normalizar(nombreSinCasa(nombreEnBase))) ?? null;
}

/** "canela, dátiles y praliné" — las primeras notas de salida y corazón, en castellano de persona. */
export function aQueHuele(p: Pick<Perfume, "notas">, cuantas = 3): string | null {
  if (!p.notas) return null;
  const ns = [...p.notas.salida.slice(0, 2), ...p.notas.corazon].slice(0, cuantas).map((n) => n.toLowerCase());
  if (ns.length === 0) return null;
  if (ns.length === 1) return ns[0];
  return `${ns.slice(0, -1).join(", ")} y ${ns[ns.length - 1]}`;
}
