// ============================================================================
// ETIQUETAS DE PRECIO — el cartel de góndola y de heladera, listo para imprimir.
// ============================================================================
//
// Dos plantillas:
//   · Hoja A4 de 3 × 8 (24 etiquetas de 70 × 37 mm, las hojas autoadhesivas comunes de
//     librería). Medida PROVISIONAL A CONFIRMAR con la hoja que compre cada negocio: se
//     cambia acá, en un solo lugar.
//   · Rollo: una etiqueta por página de 60 × 40 mm, para una impresora de etiquetas.
//     PROVISIONAL A CONFIRMAR con la impresora de MAGRA. No probado en una impresora real.
//
// En los productos por peso el número grande es el PRECIO POR KILO, con "el kg" al lado: en
// una carnicería el cliente compara el kilo, no el paquete.
//
// Se imprime como un documento propio dentro de un iframe (el mismo camino que el ticket de
// Vender, vender/reglas-venta.ts): imprimir la pantalla del panel sacaría también la barra y
// los botones. El documento no lleva scripts, y todo texto que tipeó una persona (el nombre
// del producto, el del negocio) va escapado.
//
// PURO: lo usan la pantalla (vista previa e impresión) y los tests.

import type { FormaDeVenta } from "./planilla-core";

export type PlantillaId = "a4" | "rollo";

export type Plantilla = {
  id: PlantillaId;
  nombre: string;
  detalle: string;
  /** Etiquetas por hoja (A4) o 1 (rollo: cada etiqueta es su propia página). */
  porHoja: number;
};

export const PLANTILLAS: Record<PlantillaId, Plantilla> = {
  a4: { id: "a4", nombre: "Hoja A4 (3 × 8)", detalle: "24 etiquetas de 70 × 37 mm por hoja", porHoja: 24 },
  rollo: { id: "rollo", nombre: "Rollo", detalle: "Una etiqueta de 60 × 40 mm por vez", porHoja: 1 },
};

export function esPlantilla(v: unknown): v is PlantillaId {
  return v === "a4" || v === "rollo";
}

export type DatosEtiqueta = {
  id: string;
  nombre: string;
  saleUnit: FormaDeVenta;
  /** Precio de venta de su forma de venta: por kilo si es por peso. */
  precio: number;
  /** `Product.unit` de los que se venden por unidad ("unidad", "docena", "frasco"). */
  unidad: string;
};

/** Precio sin centavos si es redondo, con centavos si los tiene: "$12.500", "$1.234,50". */
export function precioDeEtiqueta(n: number): string {
  const centavos = Math.round(n * 100);
  const conCentavos = centavos % 100 !== 0;
  return (
    "$" +
    (centavos / 100).toLocaleString("es-AR", {
      minimumFractionDigits: conCentavos ? 2 : 0,
      maximumFractionDigits: conCentavos ? 2 : 0,
    })
  );
}

/** Lo que va al lado del precio: "el kg" en los de peso; "c/u" o "x docena" en los de unidad. */
export function unidadDeEtiqueta(e: Pick<DatosEtiqueta, "saleUnit" | "unidad">): string {
  if (e.saleUnit === "WEIGHT") return "el kg";
  const u = e.unidad.trim().toLowerCase();
  if (!u || u === "unidad" || u === "unidades" || u === "u" || u === "un") return "c/u";
  return `x ${e.unidad.trim()}`;
}

/** Las etiquetas repartidas en hojas de la plantilla. PURA. */
export function enHojas<T>(etiquetas: readonly T[], plantilla: PlantillaId): T[][] {
  const n = PLANTILLAS[plantilla].porHoja;
  const hojas: T[][] = [];
  for (let i = 0; i < etiquetas.length; i += n) hojas.push(etiquetas.slice(i, i + n));
  return hojas;
}

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tamaño del precio según su largo, para que "$1.234.567" no se salga de la etiqueta. En
 * puntos tipográficos: la etiqueta de A4 tiene 70 mm de ancho útil menos los márgenes.
 */
export function tamanioDelPrecio(texto: string, plantilla: PlantillaId): number {
  const base = plantilla === "a4" ? 30 : 32;
  const largo = texto.length;
  if (largo <= 7) return base; // "$12.500"
  if (largo <= 9) return base - 6; // "$123.456", "$1.234,50"
  return base - 10;
}

const CSS_COMUN =
  "*{box-sizing:border-box}" +
  "html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}" +
  ".e{overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;break-inside:avoid}" +
  ".n{font-weight:700;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}" +
  ".p{display:flex;align-items:baseline;gap:1.5mm;white-space:nowrap}" +
  ".p b{font-weight:800;letter-spacing:-.02em;line-height:1}" +
  ".u{font-weight:700}" +
  ".f{color:#444}" +
  // En pantalla (la vista previa) se ve el borde de cada etiqueta y el papel sobre gris; en el
  // papel no se imprime ningún borde: en una hoja autoadhesiva, una línea corrida se nota.
  "@media screen{body{background:#d9d9d9}.h{background:#fff;margin:0 auto 6mm}.e{outline:0.3mm dashed #aaa;outline-offset:-0.3mm}}";

const CSS_A4 =
  "@page{size:A4;margin:0}" +
  // 3 × 70 mm = 210 mm de ancho; 8 × 37 mm = 296 mm de alto, centradas en los 297 mm.
  ".h{width:210mm;height:297mm;padding:0.5mm 0;display:grid;grid-template-columns:repeat(3,70mm);grid-template-rows:repeat(8,37mm);break-after:page}" +
  ".h:last-child{break-after:auto}" +
  ".e{padding:3.5mm 4mm 3mm}" +
  ".n{font-size:11pt}.u{font-size:10pt}.f{font-size:7pt}";

const CSS_ROLLO =
  "@page{size:60mm 40mm;margin:0}" +
  ".h{width:60mm;height:40mm;break-after:page}" +
  ".h:last-child{break-after:auto}" +
  ".e{width:60mm;height:40mm;padding:3mm 3.5mm}" +
  ".n{font-size:11pt}.u{font-size:10pt}.f{font-size:7pt}";

/**
 * El documento HTML con las etiquetas, listo para imprimir. `pie` es lo que va abajo en
 * chico (el negocio y la fecha del precio: "MAGRA · precio al 23/09/2026"). PURA.
 */
export function htmlDeEtiquetas(etiquetas: readonly DatosEtiqueta[], plantilla: PlantillaId, pie: string): string {
  const hojas = enHojas(etiquetas, plantilla);
  const cuerpo = hojas
    .map(
      (hoja) =>
        `<section class="h">` +
        hoja
          .map((e) => {
            const precio = precioDeEtiqueta(e.precio);
            return (
              `<div class="e">` +
              `<div class="n">${escaparHtml(e.nombre)}</div>` +
              `<div class="p"><b style="font-size:${tamanioDelPrecio(precio, plantilla)}pt">${escaparHtml(precio)}</b>` +
              `<span class="u">${escaparHtml(unidadDeEtiqueta(e))}</span></div>` +
              `<div class="f">${escaparHtml(pie)}</div>` +
              `</div>`
            );
          })
          .join("") +
        `</section>`,
    )
    .join("");
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de precio</title><style>' +
    CSS_COMUN +
    (plantilla === "a4" ? CSS_A4 : CSS_ROLLO) +
    "</style></head><body>" +
    cuerpo +
    "</body></html>"
  );
}

/** Ancho y alto de una hoja de la plantilla, en píxeles CSS (96 por pulgada). Para la vista previa. */
export function tamanioDeHojaPx(plantilla: PlantillaId): { ancho: number; alto: number } {
  const mm = (n: number) => Math.round((n * 96) / 25.4);
  return plantilla === "a4" ? { ancho: mm(210), alto: mm(297) } : { ancho: mm(60), alto: mm(40) };
}

/** Lo que viaja a la acción que registra la impresión, validado (una acción es un endpoint). */
export function idsDesdeAfuera(v: unknown, maximo = 2000): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > maximo) return null;
  if (!v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) return null;
  return [...new Set(v as string[])];
}
