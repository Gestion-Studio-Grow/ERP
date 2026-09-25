// STOCK DEL DISEÑO NUEVO («Renglón») — qué productos se ven, en qué orden y cuántos por página.
//
// La planilla de la cámara pasada en limpio: lo que está mal primero (en negativo, bajo el mínimo),
// después el resto como se recorre la góndola. Todo sale de la URL (?q=, ?vista=, ?orden=, ?cursor=
// con el número de página) y se resuelve en el SERVIDOR: al navegador llega la página que se mira.
// Las filas son las mismas de `getInventory()` (costo vigente, `esStockBajo`, `estaEnNegativo`):
// acá no se consulta nada ni se calcula plata nueva; sólo se filtra, se ordena y se corta.
//
// Client-safe: sin Prisma ni servidor.

import { ordenDesdeUrl, type OrdenTabla } from "@/components/ui/tabla-core";
import { CORTE_CATEGORIAS, effectiveCategoria, type CorteCategoria } from "@/lib/carniceria/cortes";
import { normalizarNombre } from "@/lib/catalogo/planilla-core";
import type { InventoryRow } from "@/lib/inventario/valuation";

export const TAMANIO_PAGINA_STOCK = 50;

/** Las columnas que la tabla deja ordenar («valor» sólo tiene sentido para quien ve costos). */
export const ORDENABLES_STOCK = ["nombre", "stock", "valor"] as const;

/** Los chips de arriba. No son una partición: uno en negativo también puede no tener costo. */
export const VISTAS_STOCK = ["negativo", "stock-bajo", "sin-costo"] as const;
export type VistaStock = (typeof VISTAS_STOCK)[number];

export const VISTA_STOCK_ETIQUETA: Record<VistaStock, string> = {
  negativo: "En negativo",
  "stock-bajo": "Stock bajo",
  "sin-costo": "Sin costo",
};

/** Una fila de la planilla: la de `getInventory()` más la góndola y el mínimo, si se conocen. */
export type FilaDeStock = InventoryRow & {
  /** Sólo en la carnicería (velas y pádel no tienen góndola). */
  gondola: CorteCategoria | null;
  /** El mínimo cargado en el producto, o null si la fila no lo trae. */
  minimo: number | null;
};

/**
 * Arma la fila. El mínimo se lee si la fila lo trae (`lowStockAt`): hoy `aFilaDeInventario` no lo
 * copia, y la columna «Mínimo» no se muestra hasta que lo haga. No se inventa un mínimo.
 */
export function aFilaDeStock(r: InventoryRow, categoria: string | null | undefined, carniceria: boolean): FilaDeStock {
  const conMinimo = r as InventoryRow & { lowStockAt?: unknown };
  const minimo = typeof conMinimo.lowStockAt === "number" && Number.isFinite(conMinimo.lowStockAt) ? conMinimo.lowStockAt : null;
  return {
    ...r,
    gondola: carniceria ? effectiveCategoria(r.name, categoria ?? null) : null,
    minimo,
  };
}

/**
 * La unidad como se escribe al lado de la cifra: «kg» o «u». Algunos productos traen la palabra
 * entera («unidad») y quedaba «5 unidad»; el dato no se toca, sólo cómo se lee.
 */
export function unidadCorta(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "unidad" || u === "unidades" || u === "un" || u === "u.") return "u";
  if (u === "kilo" || u === "kilos" || u === "kgs") return "kg";
  return unit.trim() || "u";
}

export type ParametrosStock = {
  q: string;
  vista: VistaStock | null;
  orden: OrdenTabla;
  pagina: number;
};

type Sp = Readonly<Record<string, string | string[] | undefined>>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const esVista = (v: string | undefined): v is VistaStock => (VISTAS_STOCK as readonly string[]).includes(v ?? "");

/**
 * Lo que la planilla lee de la URL. Lo que no se entiende se ignora (no se inventa un filtro).
 * Quien no ve costos no puede pedir «sin costo» ni ordenar por valor: para esa persona no existen.
 */
export function leerParametrosStock(sp: Sp, conCostos: boolean): ParametrosStock {
  const q = (uno(sp.q) ?? "").trim().slice(0, 80);
  const v = uno(sp.vista);
  const n = Number.parseInt(uno(sp.cursor) ?? "", 10);
  const orden = ordenDesdeUrl(uno(sp.orden), ORDENABLES_STOCK);
  return {
    q,
    vista: esVista(v) && (v !== "sin-costo" || conCostos) ? v : null,
    orden: orden && orden.key === "valor" && !conCostos ? null : orden,
    pagina: Number.isFinite(n) && n >= 1 ? n : 1,
  };
}

/** El estado que se lee en la columna «Estado», uno solo por fila, del más urgente al normal. */
export type EstadoDeStock = "negativo" | "stock-bajo" | "sin-costo" | "en-orden";

/** «Sin costo» es el de la valuación: tiene stock y no se le conoce el costo (como el resumen). */
const faltaCosto = (f: InventoryRow) => f.sinCosto && f.stock > 0;

export function estadoDeStock(f: InventoryRow, conCostos: boolean): EstadoDeStock {
  if (f.negative) return "negativo";
  if (f.belowLowStock) return "stock-bajo";
  if (conCostos && faltaCosto(f)) return "sin-costo";
  return "en-orden";
}

function enVista(f: InventoryRow, v: VistaStock): boolean {
  switch (v) {
    case "negativo":
      return f.negative;
    case "stock-bajo":
      return f.belowLowStock;
    case "sin-costo":
      return faltaCosto(f);
  }
}

/** ¿Coincide con lo buscado? Por nombre, sin tildes ni mayúsculas. */
export function coincideStock(f: InventoryRow, q: string): boolean {
  if (!q) return true;
  return normalizarNombre(f.name).includes(normalizarNombre(q));
}

const INDICE_GONDOLA = new Map(CORTE_CATEGORIAS.map((g, i) => [g.id, i]));
const URGENCIA: Record<EstadoDeStock, number> = { negativo: 0, "stock-bajo": 1, "sin-costo": 2, "en-orden": 2 };
const porNombre = (a: FilaDeStock, b: FilaDeStock) => a.name.localeCompare(b.name, "es");

/**
 * Ordena. Sin orden elegido: primero lo que está mal (en negativo, después bajo el mínimo) y el
 * resto como se recorre la góndola en la carnicería (Vaca, Cerdo, Pollo…) o por nombre en los
 * demás rubros. Con orden elegido, esa columna manda; «valor» sin costo va al final.
 */
export function ordenarStock<F extends FilaDeStock>(filas: readonly F[], orden: OrdenTabla): F[] {
  const copia = [...filas];
  if (!orden) {
    const g = (f: FilaDeStock) => (f.gondola ? (INDICE_GONDOLA.get(f.gondola) ?? 99) : 0);
    const u = (f: FilaDeStock) => URGENCIA[estadoDeStock(f, false)];
    return copia.sort((a, b) => u(a) - u(b) || g(a) - g(b) || porNombre(a, b));
  }
  const signo = orden.direction === "desc" ? -1 : 1;
  if (orden.key === "nombre") return copia.sort((a, b) => signo * porNombre(a, b));
  if (orden.key === "stock") return copia.sort((a, b) => signo * (a.stock - b.stock) || porNombre(a, b));
  return copia.sort((a, b) => {
    if (a.sinCosto && b.sinCosto) return porNombre(a, b);
    if (a.sinCosto) return 1;
    if (b.sinCosto) return -1;
    return signo * (a.valuation - b.valuation) || porNombre(a, b);
  });
}

export type PaginaDeStock<F extends FilaDeStock = FilaDeStock> = {
  filas: F[];
  /** Cuántos coinciden con la búsqueda y la vista (todas las páginas). */
  coinciden: number;
  pagina: number;
  paginas: number;
  /** Cuántos hay en cada vista, con la búsqueda aplicada (el número de cada chip). */
  porVista: Record<VistaStock, number>;
  /** Cuántos coinciden con la búsqueda, sin vista (el número de «Todos»). */
  conBusqueda: number;
};

export function paginaDeStock<F extends FilaDeStock>(todas: readonly F[], p: ParametrosStock): PaginaDeStock<F> {
  const buscadas = todas.filter((f) => coincideStock(f, p.q));
  const porVista = Object.fromEntries(VISTAS_STOCK.map((v) => [v, buscadas.filter((f) => enVista(f, v)).length])) as Record<
    VistaStock,
    number
  >;
  const enLaVista = p.vista ? buscadas.filter((f) => enVista(f, p.vista!)) : buscadas;
  const ordenadas = ordenarStock(enLaVista, p.orden);
  const paginas = Math.max(1, Math.ceil(ordenadas.length / TAMANIO_PAGINA_STOCK));
  const pagina = Math.min(p.pagina, paginas);
  const desde = (pagina - 1) * TAMANIO_PAGINA_STOCK;
  return {
    filas: ordenadas.slice(desde, desde + TAMANIO_PAGINA_STOCK),
    coinciden: ordenadas.length,
    pagina,
    paginas,
    porVista,
    conBusqueda: buscadas.length,
  };
}

/**
 * A dónde lleva «Contar» de una fila: el recuento con el producto puesto si el negocio tiene esa
 * app; si no, la carga de ajustes con el motivo recuento (lo mismo que hacía «Recontar»). Null si
 * la persona no puede ni una ni otra.
 */
export function hrefContar(productId: string, puede: { recontar: boolean; mermas: boolean }): string | null {
  const id = encodeURIComponent(productId);
  if (puede.recontar) return `/admin/ajustes/recuento?producto=${id}`;
  if (puede.mermas) return `/admin/ajustes?producto=${id}&motivo=RECUENTO`;
  return null;
}
