// ============================================================================
// TRASLADOS ENTRE LOCALES — mandar mercadería de un local de la red a otro.
// ============================================================================
//
// QUÉ ES. La casa de una marca (el obrador de MAGRA) manda 10 kg de vacío a Canning: en el
// origen sale un AJUSTE de −10 y en el destino entra una REPOSICION de +10, al costo vigente
// del origen, en UNA transacción (`trasladoTransaction`, rls.ts). No hay plata: no toca ninguna
// caja, porque es la misma empresa moviendo su mercadería.
//
// LA REGLA FISCAL. Sólo entre negocios con el MISMO CUIT. Pasar mercadería a otro CUIT es una
// venta (con su factura), no un traslado, y se rechaza diciéndolo. Un negocio sin CUIT cargado
// tampoco traslada: sin el CUIT no hay forma de saber si es el mismo dueño.
// El remito que sale de acá es INTERNO: no reemplaza al remito ni al COT de ARCA/ARBA para
// mover la mercadería por la calle. Si MAGRA necesita COT o remito cárnico para ir del obrador
// a los locales: PROVISIONAL, A CONFIRMAR con su contadora.
//
// FUERA DE LA MERMA. La salida es un AJUSTE (el enum de stock no tiene un tipo "traslado" y
// sumarlo necesita migración), marcado por el PREFIJO de `createdBy` (`TRASLADO_ACTOR_PREFIX`).
// El tablero de merma (stock/merma-core.ts) importa esa constante y lo excluye: un traslado no
// es mercadería perdida.
//
// IDEMPOTENTE POR CLAVE. El formulario lleva una clave única; el traslado queda registrado en la
// auditoría del origen con esa clave. Un doble clic manda la misma clave dos veces: el segundo
// espera el candado de la clave y, dentro de la transacción Serializable, contesta "ya estaba".
//
// LÍMITES QUE SE LE DICEN A LA DUEÑA: los productos se cruzan por NOMBRE (sin acentos ni
// mayúsculas) y forma de venta, como en Stock por local; no hay "recibido con diferencia" (lo
// que sale, entra).
//
// Sin imports de VALOR de Prisma: la base llega por las fases (el `tx` de cada negocio).

import type { Prisma } from "@/generated/prisma/client";
import { leerCantidad } from "@/lib/pos-peso";
import { normalizarNombre } from "@/lib/catalogo/planilla-core";
import { costosVigentesEnTx } from "@/lib/stock/costo";
import { recordMovement, round3, TOLERANCIA_STOCK } from "@/lib/stock/ledger";

type Tx = Prisma.TransactionClient;

// ── Constantes (las lee también el tablero de merma) ────────────────────────

/** Marca de `createdBy` de los movimientos de un traslado: "traslado:user:<id>". */
export const TRASLADO_ACTOR_PREFIX = "traslado:";
/**
 * El pedazo de `where` de StockMovement que deja afuera los movimientos de un traslado: para las
 * listas de ajustes y mermas, donde un traslado no es mercadería perdida. `createdBy` no es
 * nullable (schema.prisma), así que el NOT no se lleva puestas filas sin actor.
 */
export const SIN_TRASLADOS = { NOT: { createdBy: { startsWith: TRASLADO_ACTOR_PREFIX } } } as const;
export const ACCION_TRASLADO_SALIDA = "traslado.salida";
export const ACCION_TRASLADO_ENTRADA = "traslado.entrada";
export const ENTIDAD_TRASLADO = "Traslado";
/** Líneas por traslado: un remito de mostrador, no una mudanza. */
export const MAX_LINEAS_TRASLADO = 20;
/** Tope por línea: 5 toneladas o 5000 unidades. Más que eso es un error de tipeo. */
export const MAX_CANTIDAD_TRASLADO = 5000;

export const LEYENDA_REMITO =
  "Documento interno de la marca. No válido como documento de traslado ni como remito fiscal.";

// ── El producto, cruzado entre negocios ─────────────────────────────────────

export type FormaDeVenta = "UNIT" | "WEIGHT";

/** La clave con que se cruza un producto entre locales: nombre normalizado + forma de venta. */
export function claveDeProducto(nombre: string, saleUnit: FormaDeVenta): string {
  return `${normalizarNombre(nombre)}|${saleUnit}`;
}

/** La forma de venta que lleva una clave, o null si la clave no tiene la forma esperada. */
export function formaDeLaClave(clave: string): FormaDeVenta | null {
  const [nombre, forma, ...resto] = clave.split("|");
  if (!nombre || resto.length > 0) return null;
  return forma === "WEIGHT" || forma === "UNIT" ? forma : null;
}

/** Lo que hace falta de un producto de un negocio para cruzarlo con los de otro. */
export interface ProductoParaCruzar {
  name: string;
  saleUnit: string;
  stock: number;
  active: boolean;
}

/** Cómo cruza una clave con los productos de UN negocio: uno solo, o más de uno (ambiguo). */
export type Cruce<F> = { estado: "uno"; producto: F } | { estado: "repetido" };

const formaDe = (saleUnit: string): FormaDeVenta => (saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT");

/**
 * Cómo cruza cada clave (nombre + forma de venta) con los productos no borrados de UN negocio.
 * Es LA regla: la usa la transacción (`trasladarEnFases`) y la usa el formulario para ofrecer y
 * avisar, así la pantalla nunca dice "no lo tiene" de algo que el servidor acepta, ni suma el
 * stock de dos productos que el servidor rechaza por repetidos.
 *   · como ORIGEN cuenta sólo lo activo: lo pausado no se vende y tampoco se manda;
 *   · como DESTINO cuenta también lo pausado: la mercadería llega igual (el local lo reactiva);
 *   · con varios candidatos se queda con los activos; si sigue habiendo más de uno (o todos
 *     pausados), es "repetido" y hay que renombrar uno.
 * Clave ausente en el mapa = ese negocio no lo tiene. PURA.
 */
export function cruzarPorClave<F extends ProductoParaCruzar>(filas: readonly F[], como: "origen" | "destino"): Map<string, Cruce<F>> {
  const porClave = new Map<string, F[]>();
  for (const f of filas) {
    if (como === "origen" && !f.active) continue;
    const k = claveDeProducto(f.name, formaDe(f.saleUnit));
    porClave.set(k, [...(porClave.get(k) ?? []), f]);
  }
  const cruce = new Map<string, Cruce<F>>();
  for (const [k, candidatos] of porClave) {
    const activos = candidatos.length > 1 ? candidatos.filter((c) => c.active) : candidatos;
    cruce.set(k, activos.length === 1 ? { estado: "uno", producto: activos[0] } : { estado: "repetido" });
  }
  return cruce;
}

/** Lo que se lee de los productos de un negocio para un traslado (sin costos). */
export function consultaProductosParaTraslado(tenantId: string) {
  return {
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, unit: true, saleUnit: true, stock: true, active: true },
    orderBy: { name: "asc" as const },
  } satisfies Prisma.ProductFindManyArgs;
}

/** Desde un lugar: su stock (el del producto activo), o "repetido" (tiene dos activos). */
export type Salida = number | "repetido";
/** Hacia un lugar: su stock y si está pausado allá, o "repetido". */
export type Entrada = { stock: number; pausado: boolean } | "repetido";

/** Un producto en cada lugar de la red, para el formulario de traslado. Sin costos. */
export interface ProductoParaTraslado {
  clave: string;
  nombre: string;
  saleUnit: FormaDeVenta;
  unidad: string;
  /** Cómo sale de cada lugar. Ausente = ese lugar no lo tiene activo. */
  sale: Record<string, Salida>;
  /** Cómo entra en cada lugar. Ausente = ese lugar no lo tiene en su catálogo. */
  entra: Record<string, Entrada>;
}

/**
 * Los productos de todos los lugares, cruzados por clave con `cruzarPorClave`, como los ve el
 * formulario. `lugares` en el orden de la pantalla (la casa primero): el nombre que se muestra es
 * el del primer lugar que lo tiene. PURA.
 */
export function productosParaTraslado(
  lugares: readonly { id: string; productos: readonly (ProductoParaCruzar & { unit: string })[] }[],
): ProductoParaTraslado[] {
  const todos = new Map<string, ProductoParaTraslado>();
  const fila = (k: string, p: ProductoParaCruzar & { unit: string }) => {
    const f = todos.get(k) ?? {
      clave: k,
      nombre: p.name.replace(/\s+/g, " ").trim(),
      saleUnit: formaDe(p.saleUnit),
      unidad: p.unit,
      sale: {},
      entra: {},
    };
    todos.set(k, f);
    return f;
  };
  for (const { id, productos } of lugares) {
    for (const [k, c] of cruzarPorClave(productos, "destino")) {
      // Con dos del mismo nombre, el que se muestra es el primero (la lista viene por nombre).
      const muestra = c.estado === "uno" ? c.producto : productos.find((p) => claveDeProducto(p.name, formaDe(p.saleUnit)) === k)!;
      fila(k, muestra).entra[id] = c.estado === "uno" ? { stock: round3(c.producto.stock), pausado: !c.producto.active } : "repetido";
    }
    for (const [k, c] of cruzarPorClave(productos, "origen")) {
      fila(k, c.estado === "uno" ? c.producto : productos.find((p) => p.active && claveDeProducto(p.name, formaDe(p.saleUnit)) === k)!).sale[id] =
        c.estado === "uno" ? round3(c.producto.stock) : "repetido";
    }
  }
  return [...todos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.saleUnit.localeCompare(b.saleUnit));
}

/** "10 kg", "1,25 kg", "3 unidades". */
export function textoCantidad(cantidad: number, saleUnit: FormaDeVenta, unidad?: string | null): string {
  const n = cantidad.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: saleUnit === "WEIGHT" ? 3 : 0 });
  if (saleUnit === "WEIGHT") return `${n} kg`;
  const u = (unidad ?? "").trim();
  return `${n} ${u && !/^u\.?$|^unidad(es)?$/i.test(u) ? u : cantidad === 1 ? "unidad" : "unidades"}`;
}

// ── Leer lo que llega del formulario ────────────────────────────────────────

export interface LineaPedida {
  /** `claveDeProducto` del producto. */
  producto: string;
  saleUnit: FormaDeVenta;
  cantidad: number;
}

export interface PedidoTraslado {
  /** Clave de idempotencia del formulario. */
  clave: string;
  origen: string;
  destino: string;
  lineas: LineaPedida[];
  nota: string | null;
}

const RE_CLAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es una clave de traslado bien formada? (la genera el servidor con randomUUID). */
export function esClaveDeTraslado(s: unknown): s is string {
  return typeof s === "string" && RE_CLAVE.test(s);
}

/**
 * Lo que mandó el formulario → el pedido, o qué está mal. PURA. No decide si los negocios son
 * de la red ni si hay stock: eso se decide con la base, adentro de la transacción. Lo que llega
 * puede no ser texto (es un endpoint): lo que no es texto se trata como vacío.
 */
export function leerPedidoDeTraslado(campos: {
  clave: unknown;
  origen: unknown;
  destino: unknown;
  productos: readonly unknown[];
  cantidades: readonly unknown[];
  nota: unknown;
}): { ok: true; pedido: PedidoTraslado } | { ok: false; error: string } {
  const texto = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  if (!esClaveDeTraslado(campos.clave)) {
    return { ok: false, error: "El formulario llegó incompleto. Recargá la página y cargá el traslado de nuevo." };
  }
  const origen = texto(campos.origen);
  const destino = texto(campos.destino);
  if (!origen) return { ok: false, error: "Elegí de dónde sale la mercadería." };
  if (!destino) return { ok: false, error: "Elegí a qué local va la mercadería." };
  if (origen === destino) return { ok: false, error: "El origen y el destino son el mismo local: elegí otro destino." };

  const lineas: LineaPedida[] = [];
  const vistos = new Set<string>();
  const n = Math.max(campos.productos.length, campos.cantidades.length);
  for (let i = 0; i < n; i++) {
    const producto = texto(campos.productos[i]);
    const crudo = texto(campos.cantidades[i]);
    if (!producto && !crudo) continue; // renglón vacío del formulario
    if (!producto) return { ok: false, error: `En la línea ${i + 1} falta elegir el producto.` };
    const saleUnit = formaDeLaClave(producto);
    if (!saleUnit) return { ok: false, error: `En la línea ${i + 1} el producto no se reconoce. Elegilo de nuevo de la lista.` };
    if (vistos.has(producto)) return { ok: false, error: `Un producto está en dos líneas (la ${i + 1} repite otra): dejá una sola.` };
    vistos.add(producto);
    const l = leerCantidad(crudo);
    if (l.estado !== "ok" || !(l.valor > 0)) {
      return { ok: false, error: `En la línea ${i + 1} la cantidad no se entiende. Escribila como 10 o 2,5.` };
    }
    if (saleUnit === "UNIT" && !Number.isInteger(l.valor)) {
      return { ok: false, error: `En la línea ${i + 1} el producto va por unidad: la cantidad tiene que ser entera.` };
    }
    if (l.valor > MAX_CANTIDAD_TRASLADO) {
      return { ok: false, error: `En la línea ${i + 1} la cantidad es de más de ${MAX_CANTIDAD_TRASLADO}: revisá que esté bien escrita.` };
    }
    lineas.push({ producto, saleUnit, cantidad: round3(l.valor) });
  }
  if (lineas.length === 0) return { ok: false, error: "Cargá al menos un producto con su cantidad." };
  if (lineas.length > MAX_LINEAS_TRASLADO) {
    return { ok: false, error: `Un traslado lleva hasta ${MAX_LINEAS_TRASLADO} productos: partilo en dos.` };
  }
  const nota = texto(campos.nota).replace(/\s+/g, " ").slice(0, 200) || null;
  return { ok: true, pedido: { clave: campos.clave, origen, destino, lineas, nota } };
}

// ── Dónde puede salir y entrar: la casa y sus locales, con el mismo CUIT ─────

export interface Ubicacion {
  id: string;
  /** Cómo la llama la casa ("Canning"), o el nombre de la casa. */
  nombre: string;
  esCasa: boolean;
  cuit: string | null;
}

const cuitLimpio = (c: string | null | undefined) => (c ?? "").replace(/\D/g, "") || null;

/**
 * ¿Se puede trasladar de `origen` a `destino`? Los dos tienen que estar entre las ubicaciones
 * de la red (que salen de las filas de la casa, nunca del formulario): un id ajeno da el mismo
 * error que uno que no existe. Y los dos, el mismo CUIT. PURA.
 */
export function validarUbicaciones(
  ubicaciones: readonly Ubicacion[],
  origenId: string,
  destinoId: string,
): { ok: true; origen: Ubicacion; destino: Ubicacion } | { ok: false; error: string } {
  const origen = ubicaciones.find((u) => u.id === origenId);
  const destino = ubicaciones.find((u) => u.id === destinoId);
  if (!origen) return { ok: false, error: "El origen elegido no es de tu red. Elegí uno de la lista." };
  if (!destino) return { ok: false, error: "El destino elegido no es de tu red. Elegí uno de la lista." };
  if (origen.id === destino.id) return { ok: false, error: "El origen y el destino son el mismo local: elegí otro destino." };
  for (const u of [origen, destino]) {
    if (!cuitLimpio(u.cuit)) {
      return {
        ok: false,
        error:
          `«${u.nombre}» no tiene el CUIT cargado, y sin el CUIT no se sabe si es el mismo dueño. ` +
          "Pedile a Gestión Studio Grow que lo cargue y volvé a trasladar.",
      };
    }
  }
  if (cuitLimpio(origen.cuit) !== cuitLimpio(destino.cuit)) {
    return {
      ok: false,
      error:
        `«${destino.nombre}» tiene otro CUIT que «${origen.nombre}»: pasar mercadería entre dos CUIT es una venta, ` +
        "no un traslado. Se hace como venta, con su factura.",
    };
  }
  return { ok: true, origen, destino };
}

// ── El remito (lo que queda escrito en la auditoría y se imprime) ───────────

export interface LineaRemito {
  nombre: string;
  saleUnit: FormaDeVenta;
  unidad: string;
  cantidad: number;
}

export interface Remito {
  clave: string;
  codigo: string;
  /** ISO. */
  fecha: string;
  casa: string;
  origen: { id: string; nombre: string; cuit: string | null };
  destino: { id: string; nombre: string; cuit: string | null };
  lineas: LineaRemito[];
  nota: string | null;
  /** Quién lo cargó (nombre de la persona de la casa). */
  por: string;
}

/** "T-7F3A9C21": corto, para decirlo por teléfono. No es un número fiscal. */
export function codigoDeRemito(clave: string): string {
  return `T-${clave.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

const esTexto = (x: unknown): x is string => typeof x === "string";

/** Fila de auditoría (`changes`) → remito, o null si no tiene la forma de un traslado. PURA. */
export function remitoDeLaAuditoria(changes: unknown): Remito | null {
  if (typeof changes !== "object" || changes === null) return null;
  const c = changes as Record<string, unknown>;
  const lugar = (x: unknown) => {
    if (typeof x !== "object" || x === null) return null;
    const l = x as Record<string, unknown>;
    return esTexto(l.id) && esTexto(l.nombre) ? { id: l.id, nombre: l.nombre, cuit: esTexto(l.cuit) ? l.cuit : null } : null;
  };
  const origen = lugar(c.origen);
  const destino = lugar(c.destino);
  if (!esTexto(c.clave) || !esTexto(c.codigo) || !esTexto(c.fecha) || !origen || !destino || !Array.isArray(c.lineas)) return null;
  const lineas: LineaRemito[] = [];
  for (const x of c.lineas) {
    const l = x as Record<string, unknown>;
    if (!l || !esTexto(l.nombre) || (l.saleUnit !== "UNIT" && l.saleUnit !== "WEIGHT") || typeof l.cantidad !== "number") return null;
    lineas.push({ nombre: l.nombre, saleUnit: l.saleUnit, unidad: esTexto(l.unidad) ? l.unidad : "", cantidad: l.cantidad });
  }
  return {
    clave: c.clave,
    codigo: c.codigo,
    fecha: c.fecha,
    casa: esTexto(c.casa) ? c.casa : "",
    origen,
    destino,
    lineas,
    nota: esTexto(c.nota) ? c.nota : null,
    por: esTexto(c.por) ? c.por : "",
  };
}

/** Los traslados de un día: cuántos y cuánto se movió, en kilos y en unidades. PURA. */
export function resumenDeTraslados(remitos: readonly Remito[]): { cantidad: number; kg: number; unidades: number } {
  let kg = 0;
  let unidades = 0;
  for (const r of remitos) {
    for (const l of r.lineas) {
      if (l.saleUnit === "WEIGHT") kg += l.cantidad;
      else unidades += l.cantidad;
    }
  }
  return { cantidad: remitos.length, kg: round3(kg), unidades: round3(unidades) };
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const cuitLegible = (c: string | null) => {
  const d = cuitLimpio(c);
  return d && d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d ?? "sin CUIT";
};

/**
 * El remito como documento aparte para imprimir en A4 (el mismo molde que el ticket: un iframe
 * con SÓLO el papel, sin la barra del panel). La leyenda va arriba y abajo: un remito interno
 * que se confunde con uno fiscal es el problema que se quiere evitar. PURA.
 */
export function htmlDelRemito(r: Remito, fechaLegible: string): string {
  const filas = r.lineas
    .map((l) => `<tr><td>${escapar(l.nombre)}</td><td class="n">${escapar(textoCantidad(l.cantidad, l.saleUnit, l.unidad))}</td><td class="f"></td></tr>`)
    .join("");
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remito interno ' +
    escapar(r.codigo) +
    "</title><style>" +
    "@page{size:A4;margin:14mm}" +
    "html,body{margin:0;padding:0;background:#fff;color:#000;font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    "h1{font-size:18px;margin:0 0 2mm}.ley{border:1px solid #000;padding:2mm 3mm;font-weight:700;margin:0 0 5mm}" +
    ".d{display:flex;gap:10mm;margin:0 0 5mm}.d div{flex:1}.d b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em}" +
    "table{width:100%;border-collapse:collapse;margin:0 0 6mm}th,td{border-bottom:1px solid #999;padding:2mm 1mm;text-align:left}" +
    "th{font-size:10px;text-transform:uppercase}.n{text-align:right;white-space:nowrap}.f{width:30mm}" +
    ".firmas{display:flex;gap:12mm;margin-top:14mm}.firmas div{flex:1;border-top:1px solid #000;padding-top:1mm;font-size:10px}" +
    "</style></head><body>" +
    `<h1>Remito interno ${escapar(r.codigo)}</h1>` +
    `<p class="ley">${escapar(LEYENDA_REMITO)}</p>` +
    '<div class="d">' +
    `<div><b>Fecha</b>${escapar(fechaLegible)}</div>` +
    `<div><b>Sale de</b>${escapar(r.origen.nombre)}<br>CUIT ${escapar(cuitLegible(r.origen.cuit))}</div>` +
    `<div><b>Va a</b>${escapar(r.destino.nombre)}<br>CUIT ${escapar(cuitLegible(r.destino.cuit))}</div>` +
    "</div>" +
    '<table><thead><tr><th>Producto</th><th class="n">Cantidad</th><th class="f">Recibido</th></tr></thead><tbody>' +
    filas +
    "</tbody></table>" +
    (r.nota ? `<p><b>Nota:</b> ${escapar(r.nota)}</p>` : "") +
    `<p>Cargado por ${escapar(r.por || "la casa")}${r.casa ? ` (${escapar(r.casa)})` : ""}.</p>` +
    '<div class="firmas"><div>Entregó (firma y aclaración)</div><div>Recibió (firma y aclaración)</div></div>' +
    `<p class="ley" style="margin-top:8mm">${escapar(LEYENDA_REMITO)}</p>` +
    "</body></html>"
  );
}

// ── La ejecución, en las dos fases de la transacción ────────────────────────

/** Las dos fases de `trasladoTransaction` (rls.ts). Se declara acá para no importar la base. */
export interface FasesTraslado {
  enOrigen<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
  enDestino<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

/** Un rechazo de negocio adentro de la transacción: la deshace entera y se muestra tal cual. */
export class TrasladoRechazado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "TrasladoRechazado";
  }
}

export interface ContextoTraslado {
  pedido: PedidoTraslado;
  origen: Ubicacion;
  destino: Ubicacion;
  casa: string;
  /** Id del usuario de la casa que lo carga (va en `createdBy` con el prefijo). */
  usuarioId: string;
  /** Nombre de la persona, para el remito. */
  por: string;
  ahora: Date;
}

export type ResultadoTraslado = { yaEstaba: boolean; remito: Remito };

type ProductoResuelto = { id: string; name: string; unit: string; saleUnit: FormaDeVenta; stock: number };

/**
 * Los productos del pedido en UN negocio, con el `tx` de su fase, cruzados con `cruzarPorClave`
 * (la misma regla que muestra el formulario). Devuelve los resueltos o qué línea no cruzó y por qué.
 */
async function resolverProductos(
  tx: Tx,
  tenantId: string,
  lineas: readonly LineaPedida[],
  como: "origen" | "destino",
): Promise<{ ok: true; productos: ProductoResuelto[] } | { ok: false; linea: LineaPedida; motivo: "no-esta" | "repetido" }> {
  const filas = await tx.product.findMany(consultaProductosParaTraslado(tenantId));
  const cruce = cruzarPorClave(filas, como);
  const productos: ProductoResuelto[] = [];
  for (const l of lineas) {
    const c = cruce.get(l.producto);
    if (!c) return { ok: false, linea: l, motivo: "no-esta" };
    if (c.estado === "repetido") return { ok: false, linea: l, motivo: "repetido" };
    productos.push({ id: c.producto.id, name: c.producto.name, unit: c.producto.unit, saleUnit: l.saleUnit, stock: c.producto.stock });
  }
  return { ok: true, productos };
}

const formaTexto = (s: FormaDeVenta) => (s === "WEIGHT" ? "por kilo" : "por unidad");

/**
 * El traslado, en las dos fases de UNA transacción:
 *   1. ORIGEN: candado de la clave; si ya se registró, contesta "ya estaba" sin escribir nada;
 *      cruza los productos, controla que alcance el stock, y escribe la salida (AJUSTE con el
 *      costo vigente) y la auditoría del origen, que es el registro del traslado.
 *   2. DESTINO: cruza los productos (si alguno no está, TIRA y la transacción se deshace: lo
 *      que salió del origen vuelve), y escribe la entrada (REPOSICION al costo del origen) y
 *      la auditoría del destino.
 * Cada fase escribe SÓLO filas de su negocio. No abre transacciones ni lee otro cliente.
 */
export async function trasladarEnFases(fases: FasesTraslado, ctx: ContextoTraslado): Promise<ResultadoTraslado> {
  const { pedido, origen, destino } = ctx;
  const codigo = codigoDeRemito(pedido.clave);
  const actor = `${TRASLADO_ACTOR_PREFIX}user:${ctx.usuarioId}`;

  const primera = await fases.enOrigen(async (tx) => {
    // Un doble clic manda la misma clave dos veces: el segundo espera acá a que el primero
    // termine (y la transacción Serializable lo reintenta si leyó antes de que se escribiera).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`traslado:${pedido.clave}`}))`;
    const previo = await tx.auditLog.findFirst({
      where: { tenantId: origen.id, action: ACCION_TRASLADO_SALIDA, entity: ENTIDAD_TRASLADO, entityId: pedido.clave },
      select: { changes: true },
    });
    if (previo) {
      const remito = remitoDeLaAuditoria(previo.changes);
      if (!remito) throw new TrasladoRechazado("Ese traslado ya estaba registrado. Mirá la lista de traslados de abajo.");
      return { yaEstaba: true as const, remito };
    }

    const r = await resolverProductos(tx, origen.id, pedido.lineas, "origen");
    if (!r.ok) {
      const nombre = r.linea.producto.split("|")[0];
      throw new TrasladoRechazado(
        r.motivo === "no-esta"
          ? `«${origen.nombre}» no tiene «${nombre}» (${formaTexto(r.linea.saleUnit)}) en su catálogo. Elegí el producto de nuevo de la lista.`
          : `En «${origen.nombre}» hay dos productos «${nombre}». Renombrá uno desde su catálogo y volvé a trasladar.`,
      );
    }
    pedido.lineas.forEach((l, i) => {
      const p = r.productos[i];
      if (p.stock + TOLERANCIA_STOCK < l.cantidad) {
        throw new TrasladoRechazado(
          `En «${origen.nombre}» hay ${textoCantidad(round3(Math.max(p.stock, 0)), l.saleUnit, p.unit)} de «${p.name}»: ` +
            `no alcanza para mandar ${textoCantidad(l.cantidad, l.saleUnit, p.unit)}. Si el número está mal, recontalo en ese local primero.`,
        );
      }
    });

    const costos = await costosVigentesEnTx(tx, origen.id, r.productos.map((p) => p.id));
    const lineas: LineaRemito[] = [];
    const costosPorLinea: (number | null)[] = [];
    for (const [i, l] of pedido.lineas.entries()) {
      const p = r.productos[i];
      const unitCost = costos.get(p.id) ?? null;
      await recordMovement(tx, {
        tenantId: origen.id,
        productId: p.id,
        type: "AJUSTE",
        qty: -l.cantidad,
        unitCost,
        reason: `Traslado a ${destino.nombre} · remito ${codigo}`,
        createdBy: actor,
        label: p.name,
      });
      lineas.push({ nombre: p.name, saleUnit: l.saleUnit, unidad: p.unit, cantidad: l.cantidad });
      costosPorLinea.push(unitCost);
    }
    const remito: Remito = {
      clave: pedido.clave,
      codigo,
      fecha: ctx.ahora.toISOString(),
      casa: ctx.casa,
      origen: { id: origen.id, nombre: origen.nombre, cuit: origen.cuit },
      destino: { id: destino.id, nombre: destino.nombre, cuit: destino.cuit },
      lineas,
      nota: pedido.nota,
      por: ctx.por,
    };
    // El costo va en la auditoría del origen (para reconstruir lo que valía lo que salió), pero
    // NO en el remito: el encargado lo imprime y no ve costos.
    await tx.auditLog.create({
      data: {
        tenantId: origen.id,
        actor,
        action: ACCION_TRASLADO_SALIDA,
        entity: ENTIDAD_TRASLADO,
        entityId: pedido.clave,
        channel: "admin",
        changes: { ...remito, costos: lineas.map((l, i) => ({ nombre: l.nombre, unitCost: costosPorLinea[i] })) } as unknown as Prisma.InputJsonValue,
      },
    });
    return { yaEstaba: false as const, remito, costos: costosPorLinea };
  });
  if (primera.yaEstaba) return { yaEstaba: true, remito: primera.remito };

  await fases.enDestino(async (tx) => {
    const r = await resolverProductos(tx, destino.id, pedido.lineas, "destino");
    if (!r.ok) {
      const nombre = primera.remito.lineas[pedido.lineas.indexOf(r.linea)]?.nombre ?? r.linea.producto.split("|")[0];
      throw new TrasladoRechazado(
        r.motivo === "no-esta"
          ? `«${destino.nombre}» no tiene «${nombre}» (${formaTexto(r.linea.saleUnit)}) en su catálogo. ` +
              "Mandale la lista desde «Catálogo y precios de la marca» y volvé a trasladar. No se movió nada."
          : `En «${destino.nombre}» hay dos productos «${nombre}». Renombrá uno desde su catálogo y volvé a trasladar. No se movió nada.`,
      );
    }
    for (const [i, l] of pedido.lineas.entries()) {
      const p = r.productos[i];
      await recordMovement(tx, {
        tenantId: destino.id,
        productId: p.id,
        type: "REPOSICION",
        qty: l.cantidad,
        // El costo con que salió del origen: sin costo allá, sin costo acá (no se inventa uno).
        unitCost: primera.costos[i],
        reason: `Traslado desde ${origen.nombre} · remito ${codigo}`,
        createdBy: actor,
        label: p.name,
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: destino.id,
        actor,
        action: ACCION_TRASLADO_ENTRADA,
        entity: ENTIDAD_TRASLADO,
        entityId: pedido.clave,
        channel: "admin",
        changes: primera.remito as unknown as Prisma.InputJsonValue,
      },
    });
  });
  return { yaEstaba: false, remito: primera.remito };
}

/** La consulta de los traslados que SALIERON de un negocio desde `desde` (su auditoría). */
export function consultaSalidas(tenantId: string, desde: Date, take = 200) {
  return {
    where: { tenantId, action: ACCION_TRASLADO_SALIDA, entity: ENTIDAD_TRASLADO, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" as const },
    take,
    select: { changes: true },
  } satisfies Prisma.AuditLogFindManyArgs;
}

/** La consulta del traslado `clave` en la auditoría de un negocio (el remito). */
export function consultaRemito(tenantId: string, clave: string) {
  return {
    where: { tenantId, action: ACCION_TRASLADO_SALIDA, entity: ENTIDAD_TRASLADO, entityId: clave },
    select: { changes: true },
  } satisfies Prisma.AuditLogFindFirstArgs;
}
