// ============================================================================
// VENDER BOUTIQUE · EL PRECIO DEL RENGLÓN (Magra · tanda perf, frente «cobro») — reglas PURAS
// ============================================================================
//
// Antes, cobrar eran DOS viajes en serie: `preciosVigentesDelTicket` y después `createOrder`. Ahora:
//
//   · AL SUMAR el renglón, la pantalla pide en segundo plano el precio de HOY de ese producto
//     (`preciosVigentesDelTicket`, como mucho una vez por minuto y por producto): si cambió, el ticket
//     pasa a ese precio y el renglón dice «Subió a $X recién» antes de cobrar.
//   · AL COBRAR, un solo viaje (`cobrarDelMostrador`): el formulario lleva el precio que se VE de cada
//     producto (`precioVisto`) y el servidor lo compara con la base ANTES de grabar. Si cambió, no
//     graba nada y devuelve el precio de ahora (la pantalla lo muestra y se cobra con el próximo
//     toque). Si cambia en el instante entre el control y el alta, la venta queda con el precio de
//     la base (nunca uno viejo) y la respuesta lo DICE: el control de después compara lo grabado.
//
// Todo lo de acá es puro (lo usan la pantalla y la acción); se prueba sin base.

import {
  cambiosDePrecio,
  textoDelCambioDePrecio,
  type CambioDePrecio,
  type LineaTicket,
} from "../reglas-venta";

export type PrecioVisto = { price: number | null; pricePerKg: number | null };
type ProductoConPrecio = { id: string; price: number | null; pricePerKg: number | null };
type ProductoDeLaBase = ProductoConPrecio & { name: string; saleUnit: "UNIT" | "WEIGHT" };

/** El campo del formulario con el precio que se ve: `<id>|<price>|<pricePerKg>` (vacío = sin precio). */
export const CAMPO_PRECIO_VISTO = "precioVisto";
/** Hasta cuántos productos se controlan por cobro (lo mismo que `preciosVigentesDelTicket`). */
export const MAX_PRECIOS_VISTOS = 100;
/** Un producto ya controlado al sumarlo no se vuelve a pedir antes de esto (el cobro igual controla). */
export const CONTROL_DEL_RENGLON_MS = 60_000;

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

function numeroDelCampo(n: number | null): string {
  return n == null || !Number.isFinite(n) ? "" : String(n);
}

/** Los campos `precioVisto` de los productos del ticket (sin repetir). PURA. */
export function camposDePreciosVistos(productos: readonly ProductoConPrecio[]): [string, string][] {
  const ya = new Set<string>();
  const out: [string, string][] = [];
  for (const p of productos) {
    if (!ID_VALIDO.test(p.id) || ya.has(p.id)) continue;
    ya.add(p.id);
    out.push([CAMPO_PRECIO_VISTO, `${p.id}|${numeroDelCampo(p.price)}|${numeroDelCampo(p.pricePerKg)}`]);
    if (out.length >= MAX_PRECIOS_VISTOS) break;
  }
  return out;
}

function leerNumero(crudo: string): number | null | undefined {
  if (crudo === "") return null;
  const n = Number(crudo);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Lo que mandó la pantalla, sin confiar: id con la forma de un id, precios finitos y no negativos,
 * hasta 100. Lo que no se entiende se descarta (ese producto lo cobra el servidor con la base, como
 * siempre: nunca deja de controlarse a favor de un precio mandado). PURA.
 */
export function leerPreciosVistos(valores: readonly unknown[]): Map<string, PrecioVisto> {
  const out = new Map<string, PrecioVisto>();
  for (const v of valores) {
    if (out.size >= MAX_PRECIOS_VISTOS) break;
    if (typeof v !== "string") continue;
    const partes = v.split("|");
    if (partes.length !== 3) continue;
    const [id, p, k] = partes;
    if (!ID_VALIDO.test(id) || out.has(id)) continue;
    const price = leerNumero(p);
    const pricePerKg = leerNumero(k);
    if (price === undefined || pricePerKg === undefined) continue;
    out.set(id, { price, pricePerKg });
  }
  return out;
}

/** Los productos cuyo precio en la base ya no es el que se ve (por unidad o por kilo, según la base). PURA. */
export function cambiosContraLoVisto(
  vistos: ReadonlyMap<string, PrecioVisto>,
  enBase: readonly ProductoDeLaBase[],
): CambioDePrecio[] {
  const enPantalla = enBase
    .filter((p) => vistos.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, saleUnit: p.saleUnit, ...vistos.get(p.id)! }));
  const vigentes = Object.fromEntries(enBase.map((p) => [p.id, { price: p.price, pricePerKg: p.pricePerKg }]));
  return cambiosDePrecio(enPantalla, vigentes);
}

/** Un producto que se ve en el ticket y ya no se vende (pausado, borrado o sin precio). */
export type ProductoQueNoSeVende = { id: string; nombre: string };
type FilaDelControl = ProductoDeLaBase & { active: boolean; deletedAt: Date | null };

function tienePrecio(p: ProductoConPrecio & { saleUnit: "UNIT" | "WEIGHT" }): boolean {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) != null;
}

/**
 * Lo que se ve en el ticket y ya no se puede cobrar: el producto de ESTE negocio está pausado,
 * borrado o sin precio para su unidad. Sin esto, `createOrder` descartaba el renglón y la venta
 * salía SIN él y sin aviso. Un id que no es del negocio no está en `filas`: lo rechaza el alta. PURA.
 */
export function queYaNoSeVenden(
  vistos: ReadonlyMap<string, PrecioVisto>,
  filas: readonly FilaDelControl[],
): ProductoQueNoSeVende[] {
  const porId = new Map(filas.map((f) => [f.id, f]));
  const out: ProductoQueNoSeVende[] = [];
  for (const id of vistos.keys()) {
    const f = porId.get(id);
    if (f && (!f.active || f.deletedAt !== null || !tienePrecio(f))) out.push({ id, nombre: f.name });
  }
  return out;
}

/** Los que sí se pueden cobrar (activos, no borrados y con precio para su unidad). PURA. */
export function vendibles<F extends FilaDelControl>(filas: readonly F[]): F[] {
  return filas.filter((f) => f.active && f.deletedAt === null && tienePrecio(f));
}

/** El aviso del cobro frenado porque un producto del ticket ya no se vende. PURA. */
export function avisoDeQueYaNoSeVende(productos: readonly ProductoQueNoSeVende[]): string {
  const nombres = productos.map((p) => p.nombre).join(" · ");
  return `${nombres}: ya no se vende (lo sacaron del catálogo o le falta el precio). Lo sacamos del ticket y no se cobró nada; revisá el total y cobrá de nuevo.`;
}

/** Saca del ticket los renglones de esos productos; si no queda ninguno, deja uno vacío. PURA. */
export function sinLosQueNoSeVenden<L extends { key: number; productId: string; qtyText: string }>(
  lineas: readonly L[],
  ids: ReadonlySet<string>,
  keyVacia: number,
): { lineas: L[]; usoKeyVacia: boolean } {
  const resto = lineas.filter((l) => !ids.has(l.productId));
  if (resto.length > 0) return { lineas: resto, usoKeyVacia: false };
  if (lineas.length === 0) return { lineas: [], usoKeyVacia: false };
  return { lineas: [{ ...lineas[0], key: keyVacia, productId: "", qtyText: "", etiqueta: undefined } as L], usoKeyVacia: true };
}

/**
 * El precio con que quedó grabado cada producto, desde las líneas del ticket (sin otra lectura): la
 * línea se reconoce por el nombre del producto. Si alguna línea con producto no se puede atar a UN
 * solo producto controlado (dos con el mismo nombre, o uno que cambió de nombre en el medio),
 * devuelve null y la acción lee las líneas grabadas por id. PURA.
 */
export function cobradoPorProducto(
  lineas: readonly Pick<LineaTicket, "nombre" | "precio" | "aMano" | "envio">[],
  enBase: readonly Pick<ProductoDeLaBase, "id" | "name">[],
): { productId: string; precio: number }[] | null {
  const porNombre = new Map<string, string[]>();
  for (const p of enBase) porNombre.set(p.name, [...(porNombre.get(p.name) ?? []), p.id]);
  const out: { productId: string; precio: number }[] = [];
  for (const l of lineas) {
    if (l.aMano || l.envio) continue;
    const ids = porNombre.get(l.nombre);
    if (!ids || ids.length !== 1) return null;
    out.push({ productId: ids[0], precio: l.precio });
  }
  return out;
}

/** Lo grabado con un precio distinto del que se veía (el cambio llegó entre el control y el alta). PURA. */
export function cambiosEnLoCobrado(
  cobrado: readonly { productId: string; precio: number }[],
  vistos: ReadonlyMap<string, PrecioVisto>,
  enBase: readonly ProductoDeLaBase[],
): CambioDePrecio[] {
  const porId = new Map(enBase.map((p) => [p.id, p]));
  const out: CambioDePrecio[] = [];
  for (const c of cobrado) {
    const visto = vistos.get(c.productId);
    const p = porId.get(c.productId);
    if (!visto || !p || out.some((x) => x.id === c.productId)) continue;
    const porKilo = p.saleUnit === "WEIGHT";
    const antes = (porKilo ? visto.pricePerKg : visto.price) ?? 0;
    if (Math.round(antes * 100) !== Math.round(c.precio * 100)) {
      out.push({ id: c.productId, nombre: p.name, porKilo, antes, ahora: c.precio });
    }
  }
  return out;
}

/** ¿Se pide el precio de este producto al sumarlo? (nunca pedido, o hace más de un minuto). PURA. */
export function debeControlarPrecio(ultimoControl: number | undefined, ahora: number): boolean {
  return ultimoControl === undefined || ahora - ultimoControl >= CONTROL_DEL_RENGLON_MS;
}

function listaDeCambios(cambios: readonly CambioDePrecio[]): string {
  return cambios.map((c) => `${c.nombre} ${textoDelCambioDePrecio(c).toLowerCase()}`).join(" · ");
}

/** Lo que se dice arriba cuando el precio cambió al sumar el renglón (todavía no se cobró nada). PURA. */
export function avisoDePrecioAlSumar(cambios: readonly CambioDePrecio[]): string {
  return `Cambió un precio en el catálogo: ${listaDeCambios(cambios)}. El ticket ya está con el precio de ahora.`;
}

/** La venta se grabó, pero un precio cambió en el instante del cobro: se dice, no se calla. PURA. */
export function avisoDePrecioAlGrabar(cambios: readonly CambioDePrecio[]): string {
  return `Ojo: un precio cambió justo mientras se cobraba (${listaDeCambios(cambios)}). La venta quedó con el precio de ahora: revisá el total del ticket con el cliente.`;
}
