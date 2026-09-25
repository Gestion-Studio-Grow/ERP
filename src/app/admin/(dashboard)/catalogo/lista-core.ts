// EL CATÁLOGO DEL DISEÑO NUEVO (mostrador: MAGRA, Shine, A Dos Manos) — qué productos se ven, en
// qué orden y cuántos por página.
//
// Todo sale de la URL (?q=, ?vista=, ?orden=, ?cursor= con el número de página) y se resuelve en
// el SERVIDOR: al navegador llega la página que se mira, no el catálogo entero. Las filas salen de
// los mismos `Corte` que arma la página de siempre (getCatalog + costo vigente): acá no se consulta
// nada ni se calcula plata nueva; el margen es `margenCorte` (la misma cuenta del catálogo viejo y
// de Stock) y «stock bajo» es `esStockBajo` (la misma regla del Inicio).
//
// Client-safe: sin Prisma ni servidor.

import { ordenDesdeUrl, type OrdenTabla } from "@/components/ui/tabla-core";
import { CORTE_CATEGORIAS, effectiveCategoria, margenCorte } from "@/lib/carniceria/cortes";
import { esStockBajo } from "@/lib/inventory/valuation";
import { normalizarNombre } from "@/lib/catalogo/planilla-core";
import type { Corte } from "./CortesSection";

export const TAMANIO_PAGINA = 50;

/** Las columnas que la tabla deja ordenar. */
export const ORDENABLES = ["nombre", "precio", "stock", "margen"] as const;

/**
 * Las vistas de la lista (los chips de arriba). No son una partición: un producto sin precio y con
 * stock bajo aparece en las dos. «pausados» son los que no se venden (Product.active = false).
 */
export const VISTAS = ["sin-precio", "stock-bajo", "sin-costo", "pausados"] as const;
export type Vista = (typeof VISTAS)[number];

export const VISTA_ETIQUETA: Record<Vista, string> = {
  "sin-precio": "Sin precio",
  "stock-bajo": "Stock bajo",
  "sin-costo": "Sin costo",
  pausados: "Pausados",
};

export type ParametrosCatalogo = {
  q: string;
  vista: Vista | null;
  orden: OrdenTabla;
  pagina: number;
};

type Sp = Readonly<Record<string, string | string[] | undefined>>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const esVista = (v: string | undefined): v is Vista => (VISTAS as readonly string[]).includes(v ?? "");

/** Lo que el catálogo lee de la URL. Lo que no se entiende se ignora (no se inventa un filtro). */
export function leerParametrosCatalogo(sp: Sp): ParametrosCatalogo {
  const q = (uno(sp.q) ?? "").trim().slice(0, 80);
  const v = uno(sp.vista);
  const n = Number.parseInt(uno(sp.cursor) ?? "", 10);
  return {
    q,
    vista: esVista(v) ? v : null,
    orden: ordenDesdeUrl(uno(sp.orden), ORDENABLES),
    pagina: Number.isFinite(n) && n >= 1 ? n : 1,
  };
}

/** Qué producto abre el cajón de edición (`?editar=<id>`). Sólo un id con forma de id. */
export function leerEditar(sp: Sp): string | null {
  const v = uno(sp.editar);
  return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

/** El precio con el que se vende: por kilo si se vende al peso, por unidad si no. */
export function precioDeVenta(c: Pick<Corte, "saleUnit" | "price" | "pricePerKg">): number | null {
  return c.saleUnit === "WEIGHT" ? c.pricePerKg : c.price;
}

/** El estado que se lee en la columna «Estado», uno solo por producto, del más urgente al normal. */
export type EstadoProducto = "pausado" | "sin-precio" | "stock-bajo" | "a-la-venta";

export function estadoDe(c: Corte): EstadoProducto {
  if (!c.active) return "pausado";
  const precio = precioDeVenta(c);
  if (precio == null || precio <= 0) return "sin-precio";
  if (esStockBajo(c)) return "stock-bajo";
  return "a-la-venta";
}

function enVista(c: Corte, v: Vista): boolean {
  switch (v) {
    case "pausados":
      return !c.active;
    case "sin-precio": {
      const precio = precioDeVenta(c);
      return c.active && (precio == null || precio <= 0);
    }
    case "stock-bajo":
      return c.active && esStockBajo(c);
    case "sin-costo":
      return c.active && c.cost == null;
  }
}

/** ¿El producto coincide con lo buscado? Por nombre, sin tildes ni mayúsculas. */
export function coincideProducto(c: Corte, q: string): boolean {
  if (!q) return true;
  return normalizarNombre(c.name).includes(normalizarNombre(q));
}

const INDICE_GONDOLA = new Map(CORTE_CATEGORIAS.map((g, i) => [g.id, i]));

/** El margen como fracción (0,32), o null si falta precio o costo. */
export function margenDe(c: Corte): number | null {
  return margenCorte(precioDeVenta(c), c.cost)?.pct ?? null;
}

const porNombre = (a: Corte, b: Corte) => a.name.localeCompare(b.name, "es");

/**
 * Ordena. Sin orden elegido: en la carnicería por góndola (Vaca, Cerdo, Pollo…) y nombre, como se
 * lee el pizarrón; en los demás rubros, por nombre. Los que no tienen el dato (sin precio, sin
 * costo) van al final en cualquier sentido.
 */
export function ordenarCatalogo(filas: readonly Corte[], orden: OrdenTabla, porGondola: boolean): Corte[] {
  const copia = [...filas];
  if (!orden) {
    if (!porGondola) return copia.sort(porNombre);
    const g = (c: Corte) => INDICE_GONDOLA.get(effectiveCategoria(c.name, c.category)) ?? 99;
    return copia.sort((a, b) => g(a) - g(b) || porNombre(a, b));
  }
  const signo = orden.direction === "desc" ? -1 : 1;
  const valor = (c: Corte): number | null =>
    orden.key === "precio" ? precioDeVenta(c) : orden.key === "stock" ? c.stock : orden.key === "margen" ? margenDe(c) : null;
  if (orden.key === "nombre") return copia.sort((a, b) => signo * porNombre(a, b));
  return copia.sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va == null && vb == null) return porNombre(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return signo * (va - vb) || porNombre(a, b);
  });
}

export type PaginaDelCatalogo = {
  filas: Corte[];
  /** Cuántos coinciden con la búsqueda y la vista (todas las páginas). */
  coinciden: number;
  pagina: number;
  paginas: number;
  /** Cuántos hay en cada vista, con la búsqueda aplicada (el número de cada chip). */
  porVista: Record<Vista, number>;
  /** Cuántos coinciden con la búsqueda, sin vista (el número de «Todos»). */
  conBusqueda: number;
};

export function paginaDelCatalogo(todos: readonly Corte[], p: ParametrosCatalogo, porGondola: boolean): PaginaDelCatalogo {
  const buscados = todos.filter((c) => coincideProducto(c, p.q));
  const porVista = Object.fromEntries(VISTAS.map((v) => [v, buscados.filter((c) => enVista(c, v)).length])) as Record<Vista, number>;
  const enLaVista = p.vista ? buscados.filter((c) => enVista(c, p.vista!)) : buscados;
  const ordenados = ordenarCatalogo(enLaVista, p.orden, porGondola);
  const paginas = Math.max(1, Math.ceil(ordenados.length / TAMANIO_PAGINA));
  const pagina = Math.min(p.pagina, paginas);
  const desde = (pagina - 1) * TAMANIO_PAGINA;
  return {
    filas: ordenados.slice(desde, desde + TAMANIO_PAGINA),
    coinciden: ordenados.length,
    pagina,
    paginas,
    porVista,
    conBusqueda: buscados.length,
  };
}

/**
 * El enlace a «Actualizar precios» con lo seleccionado ya tildado. Tope de 200 ids (la URL no es
 * infinita); la pantalla de precios igual muestra y deja cambiar la selección antes de aplicar.
 */
export function hrefAumentarSeleccion(ids: readonly string[]): string {
  const validos = ids.filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 200);
  return `/admin/catalogo/precios?ids=${validos.join(",")}`;
}

/** Lo inverso, en la pantalla de precios: los ids que vienen tildados. Lo que no es un id se ignora. */
export function leerIdsTildados(sp: Sp): string[] {
  const v = uno(sp.ids);
  if (!v) return [];
  return [...new Set(v.split(",").filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)))].slice(0, 200);
}
