// Lógica pura del carrito + checkout DEMO. Sin efectos, sin DOM: 100% testeable.
// El "cobro" es Mercado Pago en MODO DEMO — nunca se mueve plata real (ADR-030/031).

import { COMPRABLES, itemDesdeSlug, type ItemComprable } from "../data/catalogo";

// Una línea del carrito: slug + cantidad. El precio se resuelve contra el catálogo
// (fuente de verdad) para que el cliente no pueda inflar/desflar precios desde el storage.
export interface LineaCarrito {
  slug: string;
  cantidad: number;
}

export interface LineaResuelta extends ItemComprable {
  cantidad: number;
  subtotalUSD: number;
  subtotalARSref: number;
}

export interface ResumenCarrito {
  lineas: LineaResuelta[];
  totalItems: number;
  totalUSD: number;
  totalARSref: number;
  vacio: boolean;
}

const SLUGS_VALIDOS = new Set(COMPRABLES.map((c) => c.slug));

/** Normaliza líneas crudas (p.ej. de localStorage): descarta slugs inválidos,
 * fuerza cantidades enteras ≥ 1 y fusiona duplicados. Nunca lanza. */
export function normalizarCarrito(crudo: unknown): LineaCarrito[] {
  if (!Array.isArray(crudo)) return [];
  const acum = new Map<string, number>();
  for (const raw of crudo) {
    if (!raw || typeof raw !== "object") continue;
    const slug = (raw as { slug?: unknown }).slug;
    const cantidad = (raw as { cantidad?: unknown }).cantidad;
    if (typeof slug !== "string" || !SLUGS_VALIDOS.has(slug)) continue;
    const n = typeof cantidad === "number" && Number.isFinite(cantidad) ? Math.floor(cantidad) : 1;
    if (n < 1) continue;
    acum.set(slug, (acum.get(slug) ?? 0) + n);
  }
  return [...acum.entries()].map(([slug, cantidad]) => ({ slug, cantidad }));
}

/** Agrega un ítem (o suma cantidad si ya está). Devuelve un carrito NUEVO (inmutable). */
export function agregarAlCarrito(
  carrito: LineaCarrito[],
  slug: string,
  cantidad = 1,
): LineaCarrito[] {
  if (!SLUGS_VALIDOS.has(slug) || cantidad < 1) return normalizarCarrito(carrito);
  const base = normalizarCarrito(carrito);
  const existe = base.find((l) => l.slug === slug);
  if (existe) {
    return base.map((l) => (l.slug === slug ? { ...l, cantidad: l.cantidad + cantidad } : l));
  }
  return [...base, { slug, cantidad }];
}

/** Quita un ítem del carrito por slug. Devuelve un carrito NUEVO. */
export function quitarDelCarrito(carrito: LineaCarrito[], slug: string): LineaCarrito[] {
  return normalizarCarrito(carrito).filter((l) => l.slug !== slug);
}

/** Cambia la cantidad de un slug; cantidad ≤ 0 lo elimina. Devuelve un carrito NUEVO. */
export function setCantidad(
  carrito: LineaCarrito[],
  slug: string,
  cantidad: number,
): LineaCarrito[] {
  if (cantidad <= 0) return quitarDelCarrito(carrito, slug);
  const base = normalizarCarrito(carrito);
  if (!base.find((l) => l.slug === slug)) return agregarAlCarrito(base, slug, cantidad);
  return base.map((l) => (l.slug === slug ? { ...l, cantidad: Math.floor(cantidad) } : l));
}

/** Resuelve el carrito contra el catálogo y calcula totales. Precio SIEMPRE del catálogo. */
export function resumirCarrito(carrito: LineaCarrito[]): ResumenCarrito {
  const lineas: LineaResuelta[] = [];
  for (const l of normalizarCarrito(carrito)) {
    const item = itemDesdeSlug(l.slug);
    if (!item) continue;
    lineas.push({
      ...item,
      cantidad: l.cantidad,
      subtotalUSD: item.precioUSD * l.cantidad,
      subtotalARSref: item.precioARSref * l.cantidad,
    });
  }
  const totalItems = lineas.reduce((a, l) => a + l.cantidad, 0);
  const totalUSD = lineas.reduce((a, l) => a + l.subtotalUSD, 0);
  const totalARSref = lineas.reduce((a, l) => a + l.subtotalARSref, 0);
  return { lineas, totalItems, totalUSD, totalARSref, vacio: lineas.length === 0 };
}

/** ID de orden DEMO reproducible a partir de un seed (ej. Date.now() en el browser).
 * Prefijo DEMO- para que quede EXPLÍCITO que no es una orden real de Mercado Pago. */
export function generarOrdenDemo(seed: number): string {
  const base = Math.abs(Math.floor(seed)).toString(36).toUpperCase().padStart(8, "0");
  return `DEMO-${base.slice(-8)}`;
}

/** Formato de moneda ARS de referencia (es-AR) sin depender del entorno de Intl del build. */
export function formatARS(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
