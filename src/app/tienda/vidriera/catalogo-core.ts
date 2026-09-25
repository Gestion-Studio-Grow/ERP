// ============================================================================
// LA VIDRIERA NUEVA — lo que se decide sin pantalla: buscar, filtrar, ordenar y la bolsa.
// ============================================================================
//
// Lo usan las tres tiendas con marca (MAGRA, Shine, A Dos Manos) y la genérica del rubro, en el
// servidor (qué sección le toca a cada producto, qué dice la URL) y en el navegador (qué se ve
// después de tipear en el buscador, cuánto suma la bolsa). DATO PURO: sin React, sin Prisma, sin
// nada de servidor. Un import de valor de Prisma acá rompería el build de /tienda sin que tsc lo vea.
//
// Lo que NO decide: el precio, el envío ni si un producto se puede pedir. Eso es del servidor
// (`placeOnlineOrder`) y de reglas-tienda.ts / storefront-shipping.ts, que siguen siendo los que
// valen. Esto sólo ordena lo que ya llegó.

import { fmtMoneyARS } from "@/components/ui/format";
import { formatearCantidad } from "@/lib/pos-peso";
import type { Disponibilidad } from "../reglas-tienda";

// ── EL PRODUCTO, COMO LLEGA A LA VIDRIERA ────────────────────────────────────

/** Lo que `getStorefront` publica de cada producto (sin stock: sólo la etiqueta ya decidida). */
export type ProductoVidriera = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  disponibilidad?: Disponibilidad;
};

/** Precio de lo que se vende: el del kilo si va por peso, el de la unidad si no. */
export function precioDe(p: Pick<ProductoVidriera, "saleUnit" | "price" | "pricePerKg">): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

export function esPorPeso(p: Pick<ProductoVidriera, "saleUnit">): boolean {
  return p.saleUnit === "WEIGHT";
}

/** Cuánto suma cada toque del «+»: un cuarto kilo o una unidad (lo mismo que las vidrieras de hoy). */
export function pasoDe(p: Pick<ProductoVidriera, "saleUnit">): number {
  return esPorPeso(p) ? 0.25 : 1;
}

/** "1,5 kg", "250 g", "2 u". El peso chico se dice en gramos: nadie pide "0,25 kg" en el mostrador. */
export function textoCantidad(p: Pick<ProductoVidriera, "saleUnit">, q: number): string {
  if (!esPorPeso(p)) return `${formatearCantidad(q)} u`;
  if (q > 0 && q < 1) return `${Math.round(q * 1000)} g`;
  return `${formatearCantidad(q)} kg`;
}

/** "$20.100". Sin centavos si no los hay; con los dos si los hay (un cuarto de kilo puede darlos). */
export function plata(n: number): string {
  const r = Math.round(n * 100) / 100;
  return fmtMoneyARS(r, Number.isInteger(r) ? 0 : 2);
}

// ── BUSCAR ──────────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes, sin signos y con un solo espacio: "Ñandú  Tallado!" → "nandu tallado". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ¿El producto responde a lo que se escribió? Cada palabra tiene que aparecer (en cualquier orden)
 * en el nombre, la sección o la marca. "bife chorizo" encuentra "Bife de chorizo"; "adidas pala"
 * encuentra "Pala Adidas Metalbone 3.4". Vacío: todo responde.
 */
export function responde(q: string, ...campos: (string | null | undefined)[]): boolean {
  const palabras = normalizar(q).split(" ").filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = ` ${campos
    .filter(Boolean)
    .map((c) => normalizar(String(c)))
    .join(" ")} `;
  return palabras.every((w) => pajar.includes(` ${w}`) || pajar.includes(w));
}

// ── FILTROS EN LA URL ───────────────────────────────────────────────────────
//
// Todo lo que el cliente elige queda en la dirección (`?q=bife&seccion=vaca&orden=precio-asc`):
// se comparte por WhatsApp, vuelve con «atrás» y la vidriera abre igual. Lo que no se entiende se
// ignora: una sección que no existe es "todas", un orden inventado es el de la carta.

export type Orden = "carta" | "precio-asc" | "precio-desc";
export const ORDENES: readonly { id: Orden; texto: string }[] = [
  { id: "carta", texto: "Orden de la carta" },
  { id: "precio-asc", texto: "Menor precio" },
  { id: "precio-desc", texto: "Mayor precio" },
];

export type Filtros = {
  q: string;
  seccion: string | null;
  marca: string | null;
  orden: Orden;
};

export const SIN_FILTROS: Filtros = { q: "", seccion: null, marca: null, orden: "carta" };

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(params: Params, clave: string): string {
  if (params instanceof URLSearchParams) return params.get(clave) ?? "";
  const v = params[clave];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function leerFiltros(params: Params, validas: { secciones: readonly string[]; marcas?: readonly string[] }): Filtros {
  const q = leer(params, "q").slice(0, 60);
  const seccion = leer(params, "seccion");
  const marca = leer(params, "marca");
  const orden = leer(params, "orden");
  return {
    q,
    seccion: validas.secciones.includes(seccion) ? seccion : null,
    marca: validas.marcas?.includes(marca) ? marca : null,
    orden: ORDENES.some((o) => o.id === orden) ? (orden as Orden) : "carta",
  };
}

/**
 * La búsqueda de la URL con estos filtros, conservando lo demás que haya (el `producto` de la ficha,
 * un `utm` de la campaña). Lo que está en su valor por defecto no se escribe: la dirección limpia es
 * `/tienda`, no `/tienda?q=&orden=carta`.
 */
export function escribirFiltros(f: Filtros, actual: URLSearchParams | string = ""): string {
  const p = new URLSearchParams(actual);
  const poner = (k: string, v: string | null | undefined) => (v ? p.set(k, v) : p.delete(k));
  poner("q", f.q.trim() || null);
  poner("seccion", f.seccion);
  poner("marca", f.marca);
  poner("orden", f.orden === "carta" ? null : f.orden);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(f.q.trim() || f.seccion || f.marca);
}

// ── LA CARTA: SECCIONES, FILTRO Y ORDEN ─────────────────────────────────────

export type SeccionDeCarta = { id: string; titulo: string };

export type GrupoDeCarta<T> = { seccion: string; items: T[] };

/**
 * Lo que se ve con estos filtros: los grupos en el orden de la carta, sólo los que tienen algo, y
 * dentro de cada uno el orden pedido. `seccionDe` y `marcaDe` los decide el servidor (por nombre,
 * con las reglas de cada marca) y viajan ya resueltos.
 */
export function carta<T extends ProductoVidriera>(
  productos: readonly T[],
  secciones: readonly SeccionDeCarta[],
  seccionDe: Readonly<Record<string, string>>,
  f: Filtros,
  marcaDe: Readonly<Record<string, string>> = {},
): { grupos: GrupoDeCarta<T>[]; visibles: number; total: number } {
  const titulo = new Map(secciones.map((s) => [s.id, s.titulo]));
  const pasan = productos.filter((p) => {
    const sec = seccionDe[p.id];
    if (f.seccion && sec !== f.seccion) return false;
    if (f.marca && marcaDe[p.id] !== f.marca) return false;
    return responde(f.q, p.name, titulo.get(sec ?? ""), marcaDe[p.id]);
  });
  const ordenar = (items: T[]): T[] => {
    if (f.orden === "carta") return items;
    const signo = f.orden === "precio-asc" ? 1 : -1;
    // Estable: a igual precio, el orden de la carta.
    return items
      .map((p, i) => ({ p, i }))
      .sort((a, b) => signo * (precioDe(a.p) - precioDe(b.p)) || a.i - b.i)
      .map((x) => x.p);
  };
  const grupos = secciones
    .map((s) => ({ seccion: s.id, items: ordenar(pasan.filter((p) => seccionDe[p.id] === s.id)) }))
    .filter((g) => g.items.length > 0);
  return { grupos, visibles: grupos.reduce((n, g) => n + g.items.length, 0), total: productos.length };
}

/** Cuántos productos tiene cada sección, con la búsqueda y la marca de ahora (para los chips). */
export function conteoPorSeccion(
  productos: readonly ProductoVidriera[],
  secciones: readonly SeccionDeCarta[],
  seccionDe: Readonly<Record<string, string>>,
  f: Filtros,
  marcaDe: Readonly<Record<string, string>> = {},
): Record<string, number> {
  const sinSeccion = { ...f, seccion: null };
  const { grupos } = carta(productos, secciones, seccionDe, sinSeccion, marcaDe);
  const out: Record<string, number> = {};
  for (const s of secciones) out[s.id] = 0;
  for (const g of grupos) out[g.seccion] = g.items.length;
  return out;
}

// ── PARA COMPARAR EN LA FICHA ───────────────────────────────────────────────

/**
 * Los de la misma sección con el precio más parecido (sin el mismo, sin los que no tienen precio):
 * lo que alguien mira al lado antes de decidir. A igual distancia, el más barato primero.
 */
export function parecidosPorPrecio<T extends ProductoVidriera>(
  p: T,
  productos: readonly T[],
  seccionDe: Readonly<Record<string, string>>,
  cuantos = 3,
): T[] {
  const sec = seccionDe[p.id];
  const base = precioDe(p);
  return productos
    .filter((x) => x.id !== p.id && seccionDe[x.id] === sec && precioDe(x) > 0 && x.saleUnit === p.saleUnit)
    .sort((a, b) => Math.abs(precioDe(a) - base) - Math.abs(precioDe(b) - base) || precioDe(a) - precioDe(b))
    .slice(0, cuantos);
}

/** En qué puesto está su precio dentro de la sección, de menor a mayor: "2.º de 6". */
export function puestoDePrecio(
  p: ProductoVidriera,
  productos: readonly ProductoVidriera[],
  seccionDe: Readonly<Record<string, string>>,
): { puesto: number; de: number } {
  const mismos = productos.filter((x) => seccionDe[x.id] === seccionDe[p.id] && precioDe(x) > 0 && x.saleUnit === p.saleUnit);
  const menores = mismos.filter((x) => precioDe(x) < precioDe(p)).length;
  return { puesto: menores + 1, de: mismos.length };
}

// ── LA MARCA DE UN PRODUCTO (pádel) ─────────────────────────────────────────
//
// El catálogo no tiene columna de marca. A Dos Manos escribe la marca en el nombre ("Pala Adidas
// Metalbone 3.4") y publica la lista de marcas que trabaja (storefront.ts `providers`). Se toma la
// primera marca de esa lista que aparezca como palabra entera en el nombre; si ninguna aparece, no
// se inventa: el producto queda sin marca y no entra en el filtro.

export function marcaYModelo(nombre: string, marcas: readonly string[]): { marca: string | null; modelo: string } {
  const n = normalizar(nombre);
  for (const m of marcas) {
    const nm = normalizar(m);
    if (!nm) continue;
    const i = ` ${n} `.indexOf(` ${nm} `);
    if (i < 0) continue;
    // El modelo es lo que viene después de la marca, si hay; si la marca va al final
    // ("Grip base Adidas"), el nombre sin la marca.
    const palabras = nombre.trim().split(/\s+/);
    const pos = palabras.findIndex((w) => normalizar(w) === nm.split(" ")[0]);
    const despues = pos >= 0 ? palabras.slice(pos + nm.split(" ").length).join(" ") : "";
    const antes = pos >= 0 ? palabras.slice(0, pos).join(" ") : nombre;
    const modelo = (despues || antes).trim() || nombre.trim();
    return { marca: m, modelo };
  }
  return { marca: null, modelo: nombre.trim() };
}

// ── LA BOLSA ────────────────────────────────────────────────────────────────

/** id del producto → cantidad (kilos o unidades). Sólo lo que tiene más de cero. */
export type Bolsa = Readonly<Record<string, number>>;

function redondear(q: number): number {
  return Math.round(q * 1000) / 1000;
}

/** Suma o saca un paso. Sin stock no se suma (el servidor lo rechazaría igual). */
export function mover(bolsa: Bolsa, p: ProductoVidriera, dir: 1 | -1): Bolsa {
  if (dir === 1 && p.disponibilidad === "sin-stock") return bolsa;
  return fijar(bolsa, p.id, (bolsa[p.id] ?? 0) + dir * pasoDe(p));
}

/** Deja la cantidad en `q` (0 o menos la saca). */
export function fijar(bolsa: Bolsa, id: string, q: number): Bolsa {
  const n = { ...bolsa };
  const r = redondear(Math.max(0, q));
  if (r > 0) n[id] = r;
  else delete n[id];
  return n;
}

export type LineaDeBolsa<T extends ProductoVidriera = ProductoVidriera> = { p: T; q: number; importe: number };

/** Las líneas, en el orden en que se sumaron, sólo de productos que siguen publicados. */
export function lineas<T extends ProductoVidriera>(bolsa: Bolsa, porId: ReadonlyMap<string, T>): LineaDeBolsa<T>[] {
  const out: LineaDeBolsa<T>[] = [];
  for (const [id, q] of Object.entries(bolsa)) {
    const p = porId.get(id);
    if (p && q > 0) out.push({ p, q, importe: Math.round(q * precioDe(p) * 100) / 100 });
  }
  return out;
}

/** Subtotal y "3 cortes" / "1 producto": una línea por peso cuenta como una pieza. */
export function resumen(ls: readonly LineaDeBolsa[]): { subtotal: number; piezas: number } {
  return {
    subtotal: Math.round(ls.reduce((s, l) => s + l.importe, 0) * 100) / 100,
    piezas: ls.reduce((n, l) => n + (esPorPeso(l.p) ? 1 : l.q), 0),
  };
}

/**
 * La bolsa guardada en el navegador (localStorage), leída sin confiar en ella: sólo ids que siguen
 * publicados, cantidades positivas y finitas, sin nada sin stock. Cualquier otra cosa se descarta.
 */
export function bolsaGuardada(raw: unknown, productos: readonly ProductoVidriera[]): Bolsa {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const porId = new Map(productos.map((p) => [p.id, p]));
  let out: Bolsa = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = porId.get(id);
    const q = typeof v === "number" ? v : Number.NaN;
    if (!p || !Number.isFinite(q) || q <= 0 || q > 1000 || p.disponibilidad === "sin-stock") continue;
    out = fijar(out, id, q);
  }
  return out;
}

// ── LA ENTREGA ──────────────────────────────────────────────────────────────

/**
 * Qué dice el renglón del envío. Con tarifa de la marca manda la tarifa (la misma cuenta que hace
 * el servidor). Sin tarifa, cada marca dice lo que es cierto de ella: MAGRA no suma envío y lo dice
 * ("Sin cargo"); una tienda que manda a todo el país sin tarifa cargada no puede decir "gratis":
 * "A coordinar".
 */
export function textoDelEnvio(opts: {
  fulfillment: "PICKUP" | "DELIVERY";
  costo: number;
  hayTarifa: boolean;
  sinTarifa: "sin-cargo" | "a-coordinar";
  hayProductos: boolean;
}): string {
  if (opts.fulfillment === "PICKUP") return "Sin cargo";
  if (!opts.hayProductos) return "—";
  if (opts.hayTarifa) return opts.costo > 0 ? plata(opts.costo) : "Sin cargo";
  return opts.sinTarifa === "sin-cargo" ? "Sin cargo" : "A coordinar";
}
