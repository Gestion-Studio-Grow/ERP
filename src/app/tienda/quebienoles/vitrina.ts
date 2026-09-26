// Lo que la vitrina de Qué Bien Olés decide sin pantalla: qué ficha le toca a cada producto de la base,
// cómo se agrupan en estantes y a dónde se escribe. DATO PURO (se testea en quebienoles.test.ts).

import type { ProductoVidriera } from "../vidriera/catalogo-core";
import { FAMILIAS, fotoDe, nombreSinCasa, perfumeDe, type Familia, type FamiliaId, type Perfume } from "./perfumes";

/** Un producto de la base con su ficha (si la tiene): lo que dibuja cada pieza de la vitrina. */
export type Pieza = ProductoVidriera & {
  perfume: Perfume | null;
  /** "Khamrah" (sin la casa, que va aparte). */
  nombre: string;
  casa: string | null;
  foto: string | null;
  familia: FamiliaId | null;
};

export function aPiezas(productos: readonly ProductoVidriera[]): Pieza[] {
  return productos.map((p) => {
    const perfume = perfumeDe(p.name);
    return {
      ...p,
      perfume,
      nombre: perfume?.nombre ?? nombreSinCasa(p.name),
      casa: perfume?.casa ?? null,
      foto: perfume ? fotoDe(perfume) : null,
      familia: perfume?.familia ?? null,
    };
  });
}

export type Estante = { familia: Familia | null; items: Pieza[] };

/**
 * Los estantes en el orden de la portada (dulces, frescos, versátiles, femeninos) y, al final, "Más
 * fragancias" con lo que el dueño sumó desde el panel y todavía no tiene ficha. Dentro de cada estante,
 * el orden de su placa (el de `PERFUMES`); lo nuevo, por nombre.
 */
export function estantes(piezas: readonly Pieza[], orden: readonly Perfume[]): Estante[] {
  const pos = new Map(orden.map((p, i) => [p.clave, i]));
  const out: Estante[] = FAMILIAS.map((f) => ({
    familia: f,
    items: piezas
      .filter((p) => p.familia === f.id)
      .sort((a, b) => (pos.get(a.perfume!.clave) ?? 0) - (pos.get(b.perfume!.clave) ?? 0)),
  }));
  const sueltos = piezas.filter((p) => p.familia === null).sort((a, b) => a.name.localeCompare(b.name, "es"));
  if (sueltos.length) out.push({ familia: null, items: sueltos });
  return out.filter((e) => e.items.length > 0);
}

/** id → familia (o "otras"), para los helpers de la carta (`parecidosPorPrecio`, `carta`). */
export function seccionPorId(piezas: readonly Pieza[]): Record<string, string> {
  return Object.fromEntries(piezas.map((p) => [p.id, p.familia ?? "otras"]));
}

/** "@quebienoles", "instagram.com/quebienoles/", "quebienoles" → "quebienoles". Vacío → la cuenta de la marca. */
export function usuarioDeInstagram(raw: string | null | undefined): string {
  const limpio = (raw ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(limpio) ? limpio : "quebienoles";
}

/** El chat de Instagram de la cuenta (así pide la marca: "pedidos y consultas por MD"). */
export function mensajeDirecto(usuario: string): string {
  return `https://ig.me/m/${usuario}`;
}
