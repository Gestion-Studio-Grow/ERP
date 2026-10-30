// ============================================================================
// LAS PALAS DE A DOS MANOS — ficha técnica de cada modelo, CON SU FUENTE.
// ============================================================================
//
// El ERP sólo sabe nombre y precio. Forma, balance, peso, núcleo, cara, nivel y juego salen de acá, y
// cada dato tiene la página donde se leyó (relevado el 29/10/2026 abriendo cada URL).
//
// [A VALIDAR dueño] Las seis fuentes son TIENDAS ESPECIALIZADAS, no el fabricante: adidas.ie dio 403 y
// head.com 429 al relevar; bullpadel.com suele dar 403. Y el nombre del catálogo no dice año ni variante
// («Adidas RX Series» tiene Red, Light y 2026): la versión elegida es la más probable y se dice en
// `modelo`. La ficha lo muestra como «ficha de referencia» y pide confirmar la versión antes de comprar.
//
// [CONTRADICTORIO] (todas sus versiones, para que el dueño cierre):
//   · Metalbone 3.4 — peso: la tabla de padelmarket dice 345-360 g; su descripción, 360-380 g.
//   · Siux Electra ST3 Stupa — forma: la tabla de zonadepadel dice lágrima; la descripción, «híbrida».
//   · Head Speed Motion — balance: padelgear dice medio; una página de HEAD vista sólo en el buscador dice
//     270 mm (alto). Se publica el de la página abierta.
//
// Una pala del catálogo que no esté acá NO se completa de memoria: la ficha dice «Ficha técnica a
// confirmar: consultanos antes de pedirla» y su silueta sale por regla del nombre (`formaPorNombre`).

export type Forma = "redonda" | "lagrima" | "diamante";
export type Nivel = "iniciacion" | "intermedio" | "avanzado" | "profesional";
export type Juego = "control" | "equilibrio" | "potencia";

export type FichaDePala = {
  /** El nombre tal cual está en el catálogo del ERP (así se encuentra la ficha). */
  catalogo: string;
  /** El modelo exacto de la fuente (con año), que es lo que hay que confirmar con el local. */
  modelo: string;
  forma: Forma;
  /** Como lo publica la fuente: «alto», «medio (265 mm)». */
  balance: string;
  /** En gramos, como lo publica la fuente. */
  peso: string;
  nucleo: string;
  cara: string;
  nivel: Nivel;
  juego: Juego;
  /** La URL que se abrió y que tiene estos datos. */
  fuente: string;
  /** Fecha del relevamiento (AAAA-MM-DD). */
  verificadoEl: string;
  /** Lo que no cierra de esta ficha, si algo. */
  nota?: string;
};

export const PALAS: readonly FichaDePala[] = [
  {
    catalogo: "Pala Adidas Metalbone 3.4",
    modelo: "adidas Metalbone 3.4 2025 (Ale Galán)",
    forma: "diamante",
    balance: "alto",
    peso: "345-360 g",
    nucleo: "EVA Soft Performance",
    cara: "Carbono aluminizado 16K",
    nivel: "avanzado",
    juego: "potencia",
    fuente: "https://padelmarket.com/it-eu/collections/racchette-collezione-metalbone/products/adidas-metalbone-3-4-2025-ale-galan-racchetta-1",
    verificadoEl: "2026-10-29",
    nota: "Peso [CONTRADICTORIO]: la misma página también dice 360-380 g.",
  },
  {
    catalogo: "Pala Bullpadel Vertex 04",
    modelo: "Bullpadel Vertex 04 2025 (Juan Tello)",
    forma: "diamante",
    balance: "alto",
    peso: "365-375 g",
    nucleo: "MultiEVA",
    cara: "Carbono X-Tend 12K",
    nivel: "avanzado",
    juego: "potencia",
    fuente: "https://padelmarket.com/it-worldwide/collections/scarpe-padel/products/bullpadel-vertex-04-2025-juan-tello-racchetta",
    verificadoEl: "2026-10-29",
  },
  {
    catalogo: "Pala Nox AT10 Genius 18K",
    modelo: "NOX AT10 Genius 18K 2026 (Agustín Tapia)",
    forma: "lagrima",
    balance: "medio",
    peso: "360-375 g",
    nucleo: "MLD Black EVA",
    cara: "Carbono aluminizado 18K",
    nivel: "avanzado",
    juego: "equilibrio",
    fuente: "https://www.padelmarket.com/products/nox-at10-genius-18k-alum-2026-by-agustin-tapia-pala",
    verificadoEl: "2026-10-29",
  },
  {
    catalogo: "Pala Siux Electra ST3 Stupa",
    modelo: "Siux Electra ST3 Stupa Pro 2024",
    forma: "lagrima",
    balance: "medio",
    peso: "360-375 g",
    nucleo: "EVA dura",
    cara: "Carbono 15K Textreme",
    nivel: "avanzado",
    juego: "equilibrio",
    fuente: "https://www.zonadepadel.com/siux/9573-siux-electra-st3-stupa-pro-2024.html",
    verificadoEl: "2026-10-29",
    nota: "Forma [CONTRADICTORIO]: la tabla dice lágrima y la descripción, híbrida.",
  },
  {
    catalogo: "Pala Head Speed Motion",
    modelo: "HEAD Speed Motion 2025",
    forma: "lagrima",
    balance: "medio",
    peso: "355 g",
    nucleo: "Power Foam",
    cara: "Grafeno",
    nivel: "avanzado",
    juego: "equilibrio",
    fuente: "https://www.padelgear.co.za/products/speed-motion-2025",
    verificadoEl: "2026-10-29",
    nota: "Balance [CONTRADICTORIO]: otra fuente de HEAD lo da alto (270 mm).",
  },
  {
    catalogo: "Pala Adidas RX Series",
    modelo: "adidas RX Series Red 2024",
    forma: "redonda",
    balance: "medio (265 mm)",
    peso: "360-375 g",
    nucleo: "EVA Soft Performance",
    cara: "Fibra de vidrio",
    nivel: "intermedio",
    juego: "control",
    fuente: "https://padelmarket.com/products/adidas-rx-series-red-2024-pala",
    verificadoEl: "2026-10-29",
    nota: "El catálogo no dice la variante: hay RX Series Red, Light y 2026.",
  },
];

const clave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const POR_NOMBRE = new Map(PALAS.map((p) => [clave(p.catalogo), p]));

/** La ficha de una pala del catálogo por su nombre, o null (= «a confirmar»). */
export function fichaDe(nombre: string): FichaDePala | null {
  return POR_NOMBRE.get(clave(nombre)) ?? null;
}

/**
 * La forma para dibujar la silueta cuando la pala no tiene ficha: regla del nombre (DISENO.md §7).
 * Es sólo el DIBUJO, rotulado como ilustración; la ficha sigue diciendo «a confirmar».
 */
export function formaPorNombre(nombre: string): Forma {
  const n = clave(nombre);
  if (/\b(metalbone|vertex|electra|stupa)\b/.test(n)) return "diamante";
  if (/\b(at10|genius)\b/.test(n)) return "lagrima";
  if (/\b(rx|speed motion)\b/.test(n)) return "redonda";
  return "lagrima";
}

export const NOMBRE_FORMA: Record<Forma, string> = { redonda: "Redonda", lagrima: "Lágrima", diamante: "Diamante" };
export const NOMBRE_NIVEL: Record<Nivel, string> = {
  iniciacion: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  profesional: "Profesional",
};
export const NOMBRE_JUEGO: Record<Juego, string> = { control: "Control", equilibrio: "Equilibrio", potencia: "Potencia" };
export const ORDEN_NIVEL: Record<Nivel, number> = { iniciacion: 0, intermedio: 1, avanzado: 2, profesional: 3 };
