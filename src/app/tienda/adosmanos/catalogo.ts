// ============================================================================
// EL CATÁLOGO DE A DOS MANOS, COMO LO VE LA VIDRIERA — dato puro (sin React, sin servidor).
// ============================================================================
//
// De cada producto del ERP (nombre y precio) sale: la sección de la carta (`seccionPadel`, la misma regla
// que la vidriera nueva), la marca y el modelo (`marcaYModelo` con las marcas del copy), qué silueta lo
// ilustra y, si es pala, su ficha técnica (palas.ts). Y lo que viaja en el pedido: el TALLE de cada
// zapatilla va escrito en la nota, porque el motor no tiene variantes (ProductoVidriera,
// vidriera/catalogo-core.ts) y no se toca.

import { marcaYModelo, normalizar, precioDe, type ProductoVidriera } from "../vidriera/catalogo-core";
import { seccionPadel } from "../vidriera/marcas";
import { fichaDe, formaPorNombre, type FichaDePala, type Forma } from "./palas";

export type SeccionId = "palas" | "calzado" | "accesorios";
export const SECCIONES: readonly { id: SeccionId; titulo: string; ancla: string }[] = [
  { id: "palas", titulo: "El cuadro de palas", ancla: "palas" },
  { id: "calzado", titulo: "Zapatillas", ancla: "zapatillas" },
  { id: "accesorios", titulo: "Pelotas y accesorios", ancla: "accesorios" },
];

/** Qué dibujo ilustra el producto (nunca una foto que no es de él). */
export type Silueta = Forma | "zapatilla" | "tubo" | "paletero" | "mochila" | "grip" | "protector" | "muniequera";

export type Vista = {
  /** Para la URL (?p=, ?vs=): estable aunque cambie el id interno. */
  slug: string;
  seccion: SeccionId;
  marca: string | null;
  modelo: string;
  silueta: Silueta;
  /** Sólo palas: la ficha con fuente, o null = «a confirmar». */
  ficha: FichaDePala | null;
  /** Sólo palas: la forma (de la ficha o, para dibujar, por regla del nombre). */
  forma: Forma | null;
  /** ¿La forma es de la ficha (dato) o de la regla del nombre (sólo dibujo)? */
  formaConFuente: boolean;
};

export function slugDe(nombre: string): string {
  return normalizar(nombre).replace(/\s+/g, "-");
}

function siluetaDe(nombre: string, seccion: SeccionId, forma: Forma | null): Silueta {
  if (seccion === "palas") return forma ?? "lagrima";
  if (seccion === "calzado") return "zapatilla";
  const n = normalizar(nombre);
  if (/\b(pelota|pelotas|tubo)\b/.test(n)) return "tubo";
  if (/\bpaletero\b/.test(n)) return "paletero";
  if (/\b(mochila|bolso)\b/.test(n)) return "mochila";
  if (/\b(grip|grips|overgrip|overgrips)\b/.test(n)) return "grip";
  if (/\bmunequeras?\b/.test(n)) return "muniequera";
  return "protector";
}

export function vistaDe(nombre: string, marcas: readonly string[]): Vista {
  const seccion = seccionPadel(nombre);
  const { marca, modelo } = marcaYModelo(nombre, marcas);
  const ficha = seccion === "palas" ? fichaDe(nombre) : null;
  const forma = seccion === "palas" ? (ficha?.forma ?? formaPorNombre(nombre)) : null;
  return {
    slug: slugDe(nombre),
    seccion,
    marca,
    modelo,
    silueta: siluetaDe(nombre, seccion, forma),
    ficha,
    forma,
    formaConFuente: Boolean(ficha),
  };
}

export type Item = ProductoVidriera & { precio: number; vista: Vista };

/** Los productos con su vista, en el orden en que llegan (la carta del ERP). */
export function itemsDe(productos: readonly ProductoVidriera[], marcas: readonly string[]): Item[] {
  return productos.map((p) => ({ ...p, precio: precioDe(p), vista: vistaDe(p.name, marcas) }));
}

// ── LA NOTA DEL PEDIDO ──────────────────────────────────────────────────────

/** El tope de `notes` en el alta (order-actions.ts: `.slice(0, 500)`). */
export const TOPE_NOTA = 500;

export type RenglonDeNota = { nombre: string; cantidad: number; talle: string | null };

/**
 * «Zapatillas Asics Gel-Padel Pro, talle 42 (x1)» por cada zapatilla con talle, y la nota de la persona
 * después. Nunca pasa el tope: si no entra, se corta la nota libre, no los talles.
 */
export function notaConTalles(renglones: readonly RenglonDeNota[], notaLibre: string): string {
  const talles = renglones.filter((r) => r.talle).map((r) => `${r.nombre}, talle ${r.talle} (x${r.cantidad})`);
  const cabeza = talles.length ? `Talles: ${talles.join("; ")}.` : "";
  const libre = notaLibre.trim();
  const junta = [cabeza, libre].filter(Boolean).join(" ");
  return junta.slice(0, TOPE_NOTA);
}
