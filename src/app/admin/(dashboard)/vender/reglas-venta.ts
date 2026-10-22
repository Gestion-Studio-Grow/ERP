// ============================================================================
// VENDER — lo que se decide sin base: descuento, vuelto, precio a mano, más vendidos y el
// texto del ticket.
// ============================================================================
//
// Vive junto a la pantalla porque es el frente del mostrador el que lo escribe; lo importan la
// pantalla (client component) y la Server Action (`createOrder`). El descuento y el precio a
// mano, que usa también el núcleo del alta, están en src/lib/venta-reglas.ts (re-exportados
// acá). Todo es DATO PURO: sin Prisma, sin React, sin nada de servidor. Si un día importara el
// `prisma` de valor, Turbopack rompería el build de /admin/vender sin que tsc lo vea.
//
// La regla de cada cosa se decide UNA vez y la aplican los dos lados: la pantalla la usa
// para avisar antes de cobrar y el servidor para rechazar, con el mismo texto. Si la pantalla
// y el servidor tuvieran reglas propias, el cajero vería "Cobrar" habilitado y un rechazo
// después, o al revés.

import { round2 } from "@/lib/round";
import { leerImporte, formatearCantidad } from "@/lib/pos-peso";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import { fmtDateTimeAr } from "@/lib/datetime";
import { fmtMoneyARS } from "@/components/ui/format";
import { anchoSeguro, documentoImprimible, MEDIDAS, type AnchoDeTicket } from "@/lib/impresion/ticket-css-core";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";

// ── DESCUENTO y PRECIO A MANO: viven en src/lib/venta-reglas.ts ──────────────
//
// Las usa también el núcleo del alta (order-core.ts, el de la tienda y la API) y el ajuste de
// un pedido (order-anulacion.ts): por eso no viven en la carpeta de la pantalla. Se
// re-exportan acá para que la pantalla siga importando todo lo de Vender de un solo lugar.

export {
  TOPE_DESCUENTO_RECEPCION_PCT,
  topeDeDescuento,
  aplicarDescuento,
  descuentoDelAjuste,
  textoDelDescuentoDelAjuste,
  descuentoDelFormulario,
  NOMBRE_A_MANO_MAX,
  validarLineaAMano,
  lineasAManoDelFormulario,
  topeDePrecioAMano,
  controlarPrecioAMano,
  esLineaDeEnvio,
  envioDeLasLineas,
  type TipoDescuento,
  type PedidoDeDescuento,
  type ResultadoDescuento,
  type LineaAMano,
  type TopePrecioAMano,
  type CuponDelPedido,
} from "@/lib/venta-reglas";
import { esLineaDeEnvio, validarLineaAMano as validarLineaAManoPura } from "@/lib/venta-reglas";
import { CORTE_CATEGORIAS, effectiveCategoria, type CorteCategoria } from "@/lib/carniceria/cortes";

// ── VUELTO ───────────────────────────────────────────────────────────────────
//
// Sólo con efectivo, y no se guarda: es la cuenta que el cajero hacía de cabeza con la cola
// esperando. Lo que entra al libro es el total de la venta, no lo que el cliente dio.

export type Vuelto =
  | { estado: "sin-dato" }
  | { estado: "invalido" }
  | { estado: "falta"; falta: number }
  | { estado: "ok"; vuelto: number };

export function calcularVuelto(total: number, pagoConRaw: string | null | undefined): Vuelto {
  const l = leerImporte(pagoConRaw);
  if (l.estado === "vacio") return { estado: "sin-dato" };
  if (l.estado === "invalida") return { estado: "invalido" };
  const dif = round2(l.valor - round2(total));
  if (dif < 0) return { estado: "falta", falta: round2(-dif) };
  return { estado: "ok", vuelto: dif };
}

// ── LÍNEA SIN CANTIDAD: frena el cobro ───────────────────────────────────────
//
// Una línea con producto elegido y sin cantidad (vacía, 0 o negativa) NO viaja al servidor: los
// campos ocultos de la línea sólo salen con cantidad, y el alta sólo cuenta las líneas con
// cantidad positiva. Si el botón dejara cobrar, el ticket saldría sin ella, cobrado de menos y
// sin que nadie lo note (pendiente #17). La usan las tres pantallas de venta: Vender (las dos
// vistas) y el POS de la bandeja. La cantidad ILEGIBLE («1kg2») no entra acá: tiene su propio
// aviso en la fila y su propio freno. La línea en blanco (sin producto) tampoco: es el renglón
// para el próximo producto.

/** La primera línea del ticket con producto y sin cantidad que valga, o `undefined`. */
export function lineaSinCantidad<L extends { productId: string; qty: number; invalida: boolean }>(
  lineas: readonly L[],
): L | undefined {
  return lineas.find((l) => l.productId !== "" && !l.invalida && !(l.qty > 0));
}

/** Lo que dice el botón de cobrar frenado: qué falta y de cuál («Falta el peso de Vacío»). */
export function motivoDeLineaSinCantidad(producto: { name: string; saleUnit: "UNIT" | "WEIGHT" } | undefined): string {
  return `Falta ${producto?.saleUnit === "WEIGHT" ? "el peso" : "la cantidad"} de ${producto?.name ?? "un producto"}`;
}

// ── MÁS VENDIDOS: los 8 botones rápidos ──────────────────────────────────────

export const BOTONES_RAPIDOS = 8;
/** Días hacia atrás que miran los botones rápidos. */
export const DIAS_MAS_VENDIDOS = 30;

/**
 * Los ids de los productos más vendidos que HOY se pueden vender, en orden. PURA.
 *
 * Entra el conteo de líneas por producto (cuántas veces se vendió, no cuántos kilos: sumar
 * kilos con unidades no ordena nada). Se descartan las líneas sin producto (precio a mano) y
 * los productos que ya no se venden (sin precio, inactivos o borrados): un botón que no
 * funciona es peor que ninguno.
 */
export function masVendidos(
  grupos: readonly { productId: string | null; _count: { _all: number } }[],
  vendibles: ReadonlySet<string>,
  n = BOTONES_RAPIDOS,
): string[] {
  return grupos
    .map((g, i) => ({ id: g.productId, veces: g._count._all, i }))
    .filter((g): g is { id: string; veces: number; i: number } => !!g.id && vendibles.has(g.id))
    .sort((a, b) => b.veces - a.veces || a.i - b.i)
    .slice(0, n)
    .map((g) => g.id);
}

/**
 * Las teclas del mostrador en el diseño nuevo. PURA.
 *
 * Con ventas de sobra, son los más vendidos. El primer día de un negocio (o una semana floja)
 * no hay de dónde sacarlos y el cajero se quedaba sin teclas, teniendo que saberse los nombres
 * de memoria: entonces se completa con el catálogo que ya se puede vender, en el orden en que
 * llega (alfabético), sin repetir. Mientras haga falta completar, el rótulo no promete lo que
 * no es: dice «Tus productos», no «Más vendidos».
 */
export function teclasDelMostrador(
  vendidos: readonly string[],
  catalogo: readonly string[],
  n = BOTONES_RAPIDOS,
): { ids: string[]; rotulo: "Más vendidos" | "Tus productos" } {
  if (vendidos.length >= n) return { ids: vendidos.slice(0, n), rotulo: "Más vendidos" };
  const ids = [...vendidos];
  const ya = new Set(ids);
  for (const id of catalogo) {
    if (ids.length >= n) break;
    if (ya.has(id)) continue;
    ya.add(id);
    ids.push(id);
  }
  return { ids, rotulo: ids.length > vendidos.length ? "Tus productos" : "Más vendidos" };
}

// ── EL MOSTRADOR BOUTIQUE (interruptor `mostrador-boutique`, Magra tanda 1 · 1B) ───
//
// Las teclas muestran precio y stock del CATÁLOGO, no de las ventas: el primer día también hay
// teclas (las vendidas primero, después el resto). La unidad entra con 1 y suma si se repite.
// Todo PURO: lo prueba vender.test.ts.

/** Cuántas teclas de producto ofrece el mostrador boutique (más que las 8 de siempre). */
export const TECLAS_BOUTIQUE = 24;

/** La balanza del negocio tal como la recibe Vender (el formato guardado y si se puede cambiar). */
export type BalanzaDeVender = {
  formato: FormatoBalanza;
  /** true = nadie lo configuró: es el formato de fábrica, provisional. */
  porDefecto: boolean;
  /** Adónde se cambia el formato (sólo si quien vende puede); null = no se ofrece. */
  configurar: string | null;
};

export type TeclaDeProducto = {
  id: string;
  nombre: string;
  /** «$28.600/kg» o «$1.900/u». */
  precio: string;
  /** «quedan 4,2 kg»; null si el producto no lleva stock. */
  quedan: string | null;
  /** Sin stock (lleva stock y no queda nada). */
  agotado: boolean;
  /**
   * La tecla no carga el renglón: por unidad y agotado. Por kilo se avisa y no se frena (el
   * paquete al vacío está en la mano aunque el stock del sistema vaya atrasado; MAG-4).
   */
  bloquea: boolean;
};

/** Lo que dice una tecla de producto, del catálogo y del stock de hoy. PURA. */
export function teclaDeProducto(
  p: { id: string; name: string; saleUnit: "UNIT" | "WEIGHT"; price: number | null; pricePerKg: number | null },
  info?: { stock: number; trackStock: boolean } | null,
): TeclaDeProducto {
  const porKilo = p.saleUnit === "WEIGHT";
  const precio = `${fmtMoneyARS((porKilo ? p.pricePerKg : p.price) ?? 0, 0)}/${porKilo ? "kg" : "u"}`;
  const lleva = info?.trackStock === true;
  const agotado = lleva && !(info!.stock > 0);
  const quedan = lleva && !agotado ? `quedan ${formatearCantidad(info!.stock)} ${porKilo ? "kg" : "u"}` : null;
  return { id: p.id, nombre: p.name, precio, quedan, agotado, bloquea: agotado && !porKilo };
}

/** Un renglón del ticket: el producto y lo tipeado (texto, como en la pantalla). */
export type RenglonDeVenta = { key: number; productId: string; qtyText: string };

/**
 * Una unidad más (o `n`, del «3*código») de un producto por unidad: tecla o código leído. PURA.
 *   · si ya hay un renglón de ese producto con cantidad entera (o vacía), le suma;
 *   · si no, usa el renglón vacío si hay uno, o agrega uno nuevo con `nuevaKey`.
 * Devuelve los renglones nuevos, cuál se tocó y si se usó `nuevaKey`.
 */
export function sumarUnaUnidad<L extends RenglonDeVenta>(
  lineas: readonly L[],
  productId: string,
  nuevaKey: number,
  n = 1,
): { lineas: RenglonDeVenta[]; key: number; usoNuevaKey: boolean } {
  const cuantas = Number.isInteger(n) && n > 0 ? n : 1;
  const misma = lineas.find((l) => l.productId === productId);
  if (misma) {
    const t = misma.qtyText.trim();
    const actual = t === "" ? 0 : Number(t.replace(",", "."));
    if (Number.isInteger(actual) && actual >= 0) {
      return {
        lineas: lineas.map((l) => (l.key === misma.key ? { ...l, qtyText: String(actual + cuantas) } : l)),
        key: misma.key,
        usoNuevaKey: false,
      };
    }
  }
  const vacia = lineas.find((l) => !l.productId);
  if (vacia) {
    return {
      lineas: lineas.map((l) => (l.key === vacia.key ? { ...l, productId, qtyText: String(cuantas) } : l)),
      key: vacia.key,
      usoNuevaKey: false,
    };
  }
  return { lineas: [...lineas, { key: nuevaKey, productId, qtyText: String(cuantas) }], key: nuevaKey, usoNuevaKey: true };
}

/** Sin tildes y en minúsculas, para buscar «vacio» y encontrar «Vacío». */
function normalizarParaBuscar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Lo que escribió en el campo único («vac», «bondi»), contra el catálogo: los ids que coinciden,
 * primero los que EMPIEZAN así, hasta `max`. Todas las palabras tienen que estar. PURA.
 */
export function buscarEnElCatalogo(
  productos: readonly { id: string; name: string }[],
  texto: string,
  max = BOTONES_RAPIDOS,
): string[] {
  const palabras = normalizarParaBuscar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const empiezan: string[] = [];
  const contienen: string[] = [];
  for (const p of productos) {
    const n = normalizarParaBuscar(p.name);
    if (!palabras.every((w) => n.includes(w))) continue;
    (n.startsWith(palabras[0]) ? empiezan : contienen).push(p.id);
  }
  return [...empiezan, ...contienen].slice(0, max);
}

// ── EL MOSTRADOR NUEVO (Magra tanda 2 · 2A: ticket que crece y teclas por góndola) ───────────
//
// Todo PURO: lo prueba mostrador-nuevo.test.ts. La pantalla avisa; la plata la decide el servidor
// (el descuento con `aplicarDescuento` y el tope del rol, el precio con el catálogo de la base).

/** Una góndola del mostrador (pestaña de teclas): la de la carnicería, por animal. */
export type GondolaDeTeclas = { id: string; rotulo: string; ids: string[] };

/**
 * Las teclas de TODO el catálogo vendible, agrupadas por góndola (Vaca, Cerdo, Pollo…), sólo las
 * góndolas con algo y en el orden en que se recorre la cámara. Adentro de cada una, primero las
 * que más se venden (`primero`, en su orden) y después el resto como llegan (alfabético). La
 * góndola es la explícita (`Product.category`, cuando exista con Gate 2) o la del nombre. PURA.
 */
export function gondolasDelMostrador(
  productos: readonly { id: string; name: string }[],
  opts: { explicitas?: Readonly<Record<string, string>>; primero?: readonly string[] } = {},
): GondolaDeTeclas[] {
  const rango = new Map((opts.primero ?? []).map((id, i) => [id, i]));
  const porGondola = new Map<CorteCategoria, { id: string; i: number }[]>();
  productos.forEach((p, i) => {
    const g = effectiveCategoria(p.name, opts.explicitas?.[p.id] ?? null);
    const lista = porGondola.get(g) ?? [];
    lista.push({ id: p.id, i });
    porGondola.set(g, lista);
  });
  const orden = (x: { id: string; i: number }) => rango.get(x.id) ?? Number.MAX_SAFE_INTEGER;
  return CORTE_CATEGORIAS.flatMap((g) => {
    const lista = porGondola.get(g.id);
    if (!lista || lista.length === 0) return [];
    const ids = [...lista].sort((a, b) => orden(a) - orden(b) || a.i - b.i).map((x) => x.id);
    return [{ id: g.id, rotulo: g.label, ids }];
  });
}

/** La góndola de un producto (misma regla que `gondolasDelMostrador`). PURA. */
export function gondolaDe(p: { id: string; name: string }, explicitas?: Readonly<Record<string, string>>): CorteCategoria {
  return effectiveCategoria(p.name, explicitas?.[p.id] ?? null);
}

/**
 * «Quedan 2 · dejar 2 · reemplazo»: hasta `max` productos de la MISMA góndola y la misma forma de
 * venta que se pueden vender ahora (con stock o sin control de stock), sin el que falta. PURA.
 */
export function reemplazosDe(
  productId: string,
  productos: readonly { id: string; name: string; saleUnit: "UNIT" | "WEIGHT" }[],
  stockById: Readonly<Record<string, { stock: number; trackStock: boolean } | undefined>>,
  explicitas?: Readonly<Record<string, string>>,
  max = 3,
): string[] {
  const p = productos.find((x) => x.id === productId);
  if (!p) return [];
  const g = gondolaDe(p, explicitas);
  return productos
    .filter((x) => x.id !== p.id && x.saleUnit === p.saleUnit && gondolaDe(x, explicitas) === g)
    .filter((x) => {
      const s = stockById[x.id];
      return !s?.trackStock || s.stock > 0;
    })
    .slice(0, max)
    .map((x) => x.id);
}

// ── Teclas fijadas por el dueño (config `TeclasFijadas` en AuditLog, src/lib/vender) ──

/** Un id de producto como los que guarda la base (cuid): sin espacios, corto. */
const ID_DE_PRODUCTO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Las teclas fijadas, leídas de lo que venga (la fila de la base o lo que mandó la pantalla):
 * sólo ids con forma de id, sin repetir, en su orden, hasta `TECLAS_BOUTIQUE`. PURA.
 */
export function leerTeclasFijadas(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !ID_DE_PRODUCTO.test(x) || out.includes(x)) continue;
    out.push(x);
    if (out.length >= TECLAS_BOUTIQUE) break;
  }
  return out;
}

/** Fija o suelta una tecla (al final de la lista); con la lista llena, no suma más. PURA. */
export function alternarTeclaFijada(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return ids.length >= TECLAS_BOUTIQUE ? [...ids] : [...ids, id];
}

/**
 * La pestaña principal de las teclas: las que fijó el dueño (si fijó alguna que todavía se vende)
 * o, si no, las de siempre (más vendidas, completadas con el catálogo). PURA.
 */
export function teclasPrincipales(
  fijadas: readonly string[],
  vendibles: ReadonlySet<string>,
  deSiempre: { ids: readonly string[]; rotulo: string },
): { ids: string[]; rotulo: string; fijadas: boolean } {
  const vigentes = fijadas.filter((id) => vendibles.has(id));
  return vigentes.length > 0
    ? { ids: vigentes, rotulo: "Fijadas", fijadas: true }
    : { ids: [...deSiempre.ids], rotulo: deSiempre.rotulo, fijadas: false };
}

// ── El renglón: «−/+», «Quitar» con «Deshacer» 5 s ──────────────────────────────

/** Cuánto suma o resta el «−/+» de un renglón por kilo (**provisional a confirmar** con Magra). */
export const PASO_KG = 0.1;

/**
 * La cantidad después de tocar «−» o «+». Por unidad, de a 1 y nunca menos de 1; por kilo, de a
 * `PASO_KG` (al gramo, sin arrastrar el error del float) y nunca menos de un paso. PURA.
 */
export function pasoDelRenglon(qty: number, porKilo: boolean, sentido: 1 | -1): number {
  const actual = Number.isFinite(qty) && qty > 0 ? qty : 0;
  if (!porKilo) return Math.max(1, Math.round(actual) + sentido);
  const gramos = Math.round(actual * 1000) + sentido * Math.round(PASO_KG * 1000);
  return Math.max(Math.round(PASO_KG * 1000), gramos) / 1000;
}

/** Cuánto queda a la vista «Deshacer» después de quitar un renglón. */
export const DESHACER_MS = 5000;

/** Lo que se quitó, para volverlo a poner igual y en su lugar. */
export type RenglonQuitado<L> = { linea: L; indice: number };

/**
 * Quita el renglón `key`. Si era el único, queda un renglón vacío con `keyVacia` (la pantalla
 * siempre tiene dónde cargar el próximo). Devuelve también lo quitado, para «Deshacer». PURA.
 */
export function quitarRenglon<L extends { key: number; productId: string; qtyText: string }>(
  lineas: readonly L[],
  key: number,
  keyVacia: number,
): { lineas: L[]; quitado: RenglonQuitado<L> | null; usoKeyVacia: boolean } {
  const indice = lineas.findIndex((l) => l.key === key);
  if (indice < 0) return { lineas: [...lineas], quitado: null, usoKeyVacia: false };
  const resto = lineas.filter((l) => l.key !== key);
  if (resto.length > 0) return { lineas: resto, quitado: { linea: lineas[indice], indice }, usoKeyVacia: false };
  const vacia = { ...lineas[indice], key: keyVacia, productId: "", qtyText: "", etiqueta: undefined } as L;
  return { lineas: [vacia], quitado: { linea: lineas[indice], indice }, usoKeyVacia: true };
}

/**
 * «Deshacer»: el renglón vuelve igual (producto, cantidad, etiqueta) y a su lugar. Los renglones
 * vacíos que estaban esperando un producto se sacan (el que vuelve ocupa ese lugar). Si ya está,
 * no se duplica. PURA.
 */
export function deshacerRenglon<L extends { key: number; productId: string }>(lineas: readonly L[], q: RenglonQuitado<L>): L[] {
  if (lineas.some((l) => l.key === q.linea.key)) return [...lineas];
  const conProducto = lineas.filter((l) => l.productId !== "");
  const i = Math.min(Math.max(0, q.indice), conProducto.length);
  return [...conProducto.slice(0, i), q.linea, ...conProducto.slice(i)];
}

// ── Descuento en chips: 5 % · 10 % · Redondear ─────────────────────────────────

/** Los porcentajes de los chips de descuento (el tope del rol lo sigue controlando `aplicarDescuento`). */
export const CHIPS_DE_DESCUENTO = [5, 10] as const;
/** «Redondear» baja el total a la centena de abajo (**provisional a confirmar** con Magra). */
export const REDONDEO_DEL_TOTAL = 100;

/**
 * El descuento en pesos que deja el total en la centena de abajo ($36.608 → $8). 0 si ya está
 * redondo o si es menos que una centena (no se regala la venta entera). Al centavo. PURA.
 */
export function descuentoParaRedondear(total: number, paso = REDONDEO_DEL_TOTAL): number {
  const centavos = Math.round(round2(total) * 100);
  const pasoC = Math.round(paso * 100);
  if (!(centavos >= pasoC) || pasoC <= 0) return 0;
  return (centavos % pasoC) / 100;
}

// ── Precio a mano: motivos en chips y qué falta ────────────────────────────────

/** Los motivos frecuentes del precio a mano, en chips (más «Otro…», que escribe). */
export const MOTIVOS_PRECIO_A_MANO = ["No tiene precio cargado", "Pieza especial"] as const;

/**
 * Qué le falta a una línea con precio a mano, corto, para el botón de cobrar («Falta el motivo de
 * «Bondiola»»). null si está completa o si está vacía del todo (se ignora). Usa la MISMA regla
 * que el alta (`validarLineaAMano`). PURA.
 */
export function faltaEnLineaAMano(m: { nombre: string; importeText: string; motivo: string }): string | null {
  const tocada = m.nombre.trim() !== "" || m.importeText.trim() !== "" || m.motivo.trim() !== "";
  if (!tocada) return null;
  const v = validarLineaAManoPura({ nombre: m.nombre, importe: m.importeText, motivo: m.motivo });
  if (v.ok) return null;
  const nombre = m.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return "Falta qué se vende en el precio a mano";
  const importe = leerImporte(m.importeText);
  if (importe.estado === "vacio") return `Falta el importe de «${nombre}»`;
  if (importe.estado === "invalida" || !(importe.valor > 0)) return `Revisá el importe de «${nombre}»`;
  if (m.motivo.trim() === "") return `Falta el motivo de «${nombre}»`;
  return `Revisá el precio a mano de «${nombre}»`;
}

// ── «Subió a $X recién»: el precio cambió con el ticket abierto ────────────────

export type CambioDePrecio = { id: string; nombre: string; porKilo: boolean; antes: number; ahora: number };

/**
 * Los productos del ticket cuyo precio del catálogo (`vigentes`, leído de la base al cobrar) ya
 * no es el que muestra la pantalla. Lo que no vino en `vigentes` (no se pudo leer, o salió del
 * catálogo) no cuenta: lo decide el servidor al grabar. PURA.
 */
export function cambiosDePrecio(
  enPantalla: readonly { id: string; name: string; saleUnit: "UNIT" | "WEIGHT"; price: number | null; pricePerKg: number | null }[],
  vigentes: Readonly<Record<string, { price: number | null; pricePerKg: number | null } | undefined>>,
): CambioDePrecio[] {
  const out: CambioDePrecio[] = [];
  for (const p of enPantalla) {
    const v = vigentes[p.id];
    if (!v) continue;
    const porKilo = p.saleUnit === "WEIGHT";
    const antes = (porKilo ? p.pricePerKg : p.price) ?? 0;
    const ahora = (porKilo ? v.pricePerKg : v.price) ?? 0;
    if (Math.round(antes * 100) !== Math.round(ahora * 100)) out.push({ id: p.id, nombre: p.name, porKilo, antes, ahora });
  }
  return out;
}

/** «Subió a $29.900 recién» / «Bajó a $27.000 recién». PURA. */
export function textoDelCambioDePrecio(c: Pick<CambioDePrecio, "antes" | "ahora">): string {
  const plata = fmtMoneyARS(c.ahora, Number.isInteger(c.ahora) ? 0 : 2);
  return `${c.ahora > c.antes ? "Subió" : "Bajó"} a ${plata} recién`;
}

/** Lo que se dice arriba cuando el cobro se frenó porque cambió un precio. PURA. */
export function avisoDeCambioDePrecio(cambios: readonly CambioDePrecio[]): string {
  const lista = cambios.map((c) => `${c.nombre} ${textoDelCambioDePrecio(c).toLowerCase()}`).join(" · ");
  return `Cambió un precio mientras cargabas: ${lista}. El total ya está con el precio de ahora; revisalo y cobrá de nuevo.`;
}

// ── Peso en vivo de la balanza por cable, dentro del renglón activo (E03) ──────

/** Cuánto tiene que quedarse quieto el peso para tomarlo solo. */
export const PESO_QUIETO_MS = 1000;

/** ¿Se toma el peso solo? Quieto, positivo y todavía no tomado en esta activación del renglón. PURA. */
export function tomaElPesoSolo(b: { estable: boolean; pesoActual: number | null; yaTomado: boolean }): boolean {
  return b.estable && b.pesoActual !== null && b.pesoActual > 0 && !b.yaTomado;
}

/** La banda del día cerrado, arriba de Vender (el mismo hecho que frena en `fronteraDeVenta`). */
export const BANDA_DIA_CERRADO = "El día está cerrado: lo que vendas queda para cobrar mañana.";
/** El botón que registra sin cobrar cuando el día está cerrado. */
export const REGISTRAR_PARA_MANANA = "Registrar para cobrar mañana";

// ── EL TICKET ────────────────────────────────────────────────────────────────
//
// Comprobante NO fiscal para el cliente: por WhatsApp o impreso en 58 mm. Dice "No válido
// como factura" hasta que la venta se facture (ola 3). Las cantidades van con coma, como se
// leen acá ("1,24 kg", no "1.24").

export const LEYENDA_NO_FACTURA = "No válido como factura";

export type LineaTicket = {
  nombre: string;
  cantidad: number;
  porPeso: boolean;
  precio: number;
  total: number;
  /** Sin producto: se cargó con precio a mano. El cliente no lo ve; la pantalla sí. */
  aMano: boolean;
  /** El envío de la tienda (una línea sin producto, pero NO un precio a mano). */
  envio?: true;
  /**
   * Promos automáticas del renglón (caja con lector): `total` es lo que valía sin promo y esto
   * es lo que descontaron, con el nombre de cada promo. Ausente = sin promo.
   */
  promo?: { nombres: string[]; descuento: number };
};

/** Una venta tal como la muestra el ticket. Serializable: viaja del servidor a la pantalla. */
export type VentaTicket = {
  id: string;
  code: number;
  /** ISO. */
  creada: string;
  lineas: LineaTicket[];
  subtotal: number;
  descuento: number;
  total: number;
  /** `PaymentMethod` tal cual, o null si no está cobrada. */
  medio: string | null;
  /** Nombre del cliente, o null si es la venta anónima de mostrador. */
  cliente: string | null;
  telefono: string | null;
  anulada: boolean;
  /** Saldada contra la cuenta corriente del cliente: sin medio, no entró plata. */
  aCuenta?: true;
  /** Cobrada con VARIOS medios: cuánto por cada uno (`medio` queda null en el ticket). */
  pagos?: { medio: string; monto: number }[];
  /** Lo que ahorró el cliente con las promos automáticas (ya está descontado en el subtotal). */
  ahorroPromos?: number;
};

export type OrdenParaTicket = {
  id: string;
  code: number;
  createdAt: Date | string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string | null;
  customerName: string;
  customerPhone: string;
  status: string;
  /** Con `paid` y sin medio, la venta quedó a cuenta. Opcional: los lectores viejos no lo traen. */
  paid?: boolean;
  /**
   * Los cobros de la venta (`Collection` de origen ORDER): existen sólo en una venta cobrada con
   * varios medios (supermercado/pago-mixto-tx.ts). La venta guarda el medio principal.
   */
  collections?: readonly { method: string; amount: unknown }[];
  /** La fila de promos de la venta (supermercado/promos-de-la-venta.ts), si la hay. */
  promos?: unknown;
  items: readonly {
    productId: string | null;
    name: string;
    saleUnit: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

/** El nombre que ponen el POS y la vidriera cuando no hay cliente. */
const SIN_CLIENTE = "Mostrador";

export function ventaDeOrden(o: OrdenParaTicket): VentaTicket {
  const nombre = o.customerName.trim();
  const pagos = (o.collections ?? [])
    .map((c) => ({ medio: String(c.method), monto: Number(c.amount) }))
    .filter((c) => Number.isFinite(c.monto) && c.monto > 0);
  const promosPorRenglon = renglonesConPromo(o.promos);
  const ahorro = round2(promosPorRenglon.reduce((s, r) => s + r.descuento, 0));
  return {
    id: o.id,
    code: o.code,
    creada: new Date(o.createdAt).toISOString(),
    lineas: o.items.map((it) => {
      // El envío de la tienda no tiene producto, pero no es un precio a mano: no se marca.
      const envio = esLineaDeEnvio(it);
      const promo = it.productId ? promoDelRenglon(promosPorRenglon, it.productId, it.lineTotal) : null;
      return {
        nombre: it.name,
        cantidad: it.quantity,
        porPeso: it.saleUnit === "WEIGHT",
        precio: it.unitPrice,
        total: promo ? promo.bruto : it.lineTotal,
        aMano: it.productId == null && !envio,
        ...(envio ? { envio: true as const } : {}),
        ...(promo ? { promo: { nombres: promo.promos, descuento: promo.descuento } } : {}),
      };
    }),
    subtotal: o.subtotal,
    descuento: o.discount,
    total: o.total,
    // Con varios medios, el ticket muestra el detalle y no el principal (que es lo que guarda la venta).
    medio: pagos.length > 1 ? null : o.paymentMethod,
    cliente: nombre && nombre !== SIN_CLIENTE ? nombre : null,
    telefono: o.customerPhone.trim() || null,
    anulada: o.status === "CANCELLED",
    ...(o.paid && !o.paymentMethod ? { aCuenta: true as const } : {}),
    ...(pagos.length > 1 ? { pagos } : {}),
    ...(ahorro > 0 ? { ahorroPromos: ahorro } : {}),
  };
}

type RenglonConPromo = { productId: string; bruto: number; descuento: number; promos: string[]; usado?: boolean };

/** Los renglones con promo de la fila de la venta. No confía en la forma. PURA. */
function renglonesConPromo(changes: unknown): RenglonConPromo[] {
  const rs = (changes as { renglones?: unknown } | null)?.renglones;
  if (!Array.isArray(rs)) return [];
  return rs.flatMap((x) => {
    const r = x as Partial<RenglonConPromo>;
    return typeof r.productId === "string" && typeof r.bruto === "number" && typeof r.descuento === "number" && Array.isArray(r.promos)
      ? [{ productId: r.productId, bruto: r.bruto, descuento: r.descuento, promos: r.promos.filter((n): n is string => typeof n === "string") }]
      : [];
  });
}

/** La promo que corresponde a un renglón: mismo producto y bruto − descuento = lo cobrado. */
function promoDelRenglon(rs: RenglonConPromo[], productId: string, lineTotal: number): RenglonConPromo | null {
  const r = rs.find((x) => !x.usado && x.productId === productId && round2(x.bruto - x.descuento) === round2(lineTotal));
  if (!r) return null;
  r.usado = true;
  return r;
}

/** "1,24 kg × $12.500,00" o "2 u × $3.900,00". */
export function detalleDeLinea(l: LineaTicket): string {
  if (l.aMano || l.envio) return "";
  return `${formatearCantidad(l.cantidad)} ${l.porPeso ? "kg" : "u"} × ${fmtMoneyARS(l.precio)}${l.porPeso ? "/kg" : ""}`;
}

export type RenglonTicket = { texto: string; importe?: string; fuerte?: boolean; chico?: boolean };

/**
 * El ticket en renglones: lo mismo arma el impreso (58 mm) y el texto de WhatsApp, así los
 * dos dicen exactamente lo mismo. `pagoCon` sólo existe en el momento de cobrar (no se guarda).
 */
export function renglonesDelTicket(
  v: VentaTicket,
  opts: { negocio: string; pagoCon?: number | null },
): RenglonTicket[] {
  const r: RenglonTicket[] = [];
  r.push({ texto: opts.negocio, fuerte: true });
  r.push({ texto: `Ticket #${v.code} · ${fmtDateTimeAr(v.creada)}`, chico: true });
  if (v.cliente) r.push({ texto: `Cliente: ${v.cliente}`, chico: true });
  if (v.anulada) r.push({ texto: "VENTA ANULADA", fuerte: true });
  for (const l of v.lineas) {
    r.push({ texto: l.nombre, importe: fmtMoneyARS(l.total) });
    const det = detalleDeLinea(l);
    if (det) r.push({ texto: `  ${det}`, chico: true });
    if (l.promo) r.push({ texto: `  ${l.promo.nombres.join(" + ")}`, importe: `−${fmtMoneyARS(l.promo.descuento)}`, chico: true });
  }
  if (v.ahorroPromos) r.push({ texto: "Ahorraste con promos", importe: `−${fmtMoneyARS(v.ahorroPromos)}` });
  if (v.descuento > 0) {
    const pct = v.subtotal > 0 ? round2((v.descuento / v.subtotal) * 100) : 0;
    r.push({ texto: "Subtotal", importe: fmtMoneyARS(v.subtotal) });
    r.push({
      texto: `Descuento${pct > 0 ? ` (${String(pct).replace(".", ",")} %)` : ""}`,
      importe: `−${fmtMoneyARS(v.descuento)}`,
    });
  }
  r.push({ texto: "TOTAL", importe: fmtMoneyARS(v.total), fuerte: true });
  if (v.medio) r.push({ texto: `Pagó con ${etiquetaDeMedio(v.medio).toLowerCase()}`, chico: true });
  else if (v.pagos && v.pagos.length > 0) {
    r.push({ texto: "Pagó con:", chico: true });
    for (const p of v.pagos) r.push({ texto: `  ${etiquetaDeMedio(p.medio)}`, importe: fmtMoneyARS(p.monto), chico: true });
  } else if (v.aCuenta) r.push({ texto: "Queda a cuenta", chico: true });
  const vuelto = vueltoDelTicket(v, opts.pagoCon);
  if (vuelto !== null) {
    r.push({ texto: `Pagó con ${fmtMoneyARS(opts.pagoCon!)} · Vuelto ${fmtMoneyARS(vuelto)}`, chico: true });
  }
  r.push({ texto: LEYENDA_NO_FACTURA, chico: true });
  return r;
}

/**
 * El vuelto que se le dio al cliente, para el ticket (O-3 de la certificación de Magra T1). PURA.
 * `pagoCon` es lo que entregó en EFECTIVO (no se guarda: sólo existe al cobrar). El vuelto es
 * contra lo que se asentó en efectivo: el total si pagó todo en efectivo, o el renglón de efectivo
 * de un pago dividido (Efectivo $25.000 + MP $16.608 sobre $36.608 → asentado $20.000, vuelto
 * $5.000), la MISMA cuenta que hace el servidor (`vueltoDelCobro`). Sin efectivo, sin `pagoCon`,
 * o si lo entregado no alcanza: null (no se inventa un vuelto).
 */
export function vueltoDelTicket(v: Pick<VentaTicket, "medio" | "pagos" | "total">, pagoCon: number | null | undefined): number | null {
  if (pagoCon == null || !Number.isFinite(pagoCon)) return null;
  const efectivo =
    v.medio === "EFECTIVO"
      ? v.total
      : (v.pagos ?? []).filter((p) => p.medio === "EFECTIVO").reduce((s, p) => s + p.monto, 0) || null;
  if (efectivo == null) return null;
  const vuelto = round2(pagoCon - efectivo);
  return vuelto >= 0 ? vuelto : null;
}

/** El ticket como texto para WhatsApp (negritas con *). */
export function textoDelTicket(v: VentaTicket, opts: { negocio: string; pagoCon?: number | null }): string {
  return renglonesDelTicket(v, opts)
    .map((x) => {
      const linea = x.importe ? `${x.texto.trim()}: ${x.importe}` : x.texto.trim();
      return x.fuerte ? `*${linea}*` : linea;
    })
    .join("\n");
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * El ticket como página HTML de 58 u 80 mm (58 si no se dice: el rollo de siempre), para
 * imprimir en la térmica desde un iframe aparte. El papel (tamaño, márgenes, letra) es el
 * compartido de src/lib/impresion/ticket-css-core.ts; acá sólo van los renglones. El texto va
 * escapado: el nombre del cliente o de una línea a mano lo tipeó una persona.
 * Sin probar en una impresora térmica real.
 */
export function htmlDelTicket(renglones: readonly RenglonTicket[], opts: { ancho?: AnchoDeTicket } = {}): string {
  const ancho = anchoSeguro(opts.ancho);
  const filas = renglones
    .map((r) => {
      const clases = [r.fuerte ? "f" : "", r.chico ? "c" : ""].filter(Boolean).join(" ");
      const texto = escaparHtml(r.texto.trim());
      return r.importe
        ? `<div class="r ${clases}"><span>${texto}</span><span>${escaparHtml(r.importe)}</span></div>`
        : `<div class="${clases}">${texto}</div>`;
    })
    .join("");
  return documentoImprimible({
    titulo: "Ticket",
    ancho,
    estilos:
      ".r{display:flex;justify-content:space-between;gap:2mm}.r span:last-child{white-space:nowrap}" +
      `.f{font-weight:700}.c{font-size:${MEDIDAS[ancho].fuenteChica}px}div{margin:0 0 1px;overflow-wrap:anywhere}`,
    cuerpoHtml: filas,
  });
}
