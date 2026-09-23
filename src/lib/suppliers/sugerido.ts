// ============================================================================
// SUGERIDO DE COMPRA — qué pedir hoy y a quién. PURO.
// ============================================================================
//
// POR QUÉ. El encargado arma el pedido al proveedor mirando la heladera y la memoria: pide de
// más lo que se vende poco y se queda corto de lo que rota. El sistema ya sabe cuánto se vende
// de cada cosa (el registro de movimientos es lo único que cambia el stock) y cuánto hay: con
// eso sale una cantidad sugerida por producto, agrupada por el proveedor que se lo vende, con el
// texto listo para mandarle por WhatsApp.
//
// LA FÓRMULA (una sola, acá; la usan la pantalla y el número del Inicio):
//   venta diaria = lo que salió en los últimos 28 días / 28
//   seguridad    = el mayor entre el mínimo cargado del producto y 2 días de venta
//   sugerido     = máx(0, venta diaria × (demora + ciclo) + seguridad − stock)
// Demora del proveedor 2 días y ciclo de pedido 7 días: PROVISIONALES A CONFIRMAR con cada
// negocio (hoy no hay dónde cargarlos por proveedor: pide columna, ola 9).
//
// QUÉ CUENTA COMO "SALIÓ". Las ventas y los consumos (VENTA, CONSUMO), menos lo que volvió por
// una venta anulada o un pedido reajustado al peso (AJUSTE con esas marcas), más lo que se usó
// como pieza de entrada de un despiece (la media res que se cortó es la demanda de media res),
// más lo que salió por un traslado a otro local de la red (el obrador que abastece a los locales
// compra para ellos; sin esto su sugerido daba casi cero). La entrada del traslado en el local
// que lo recibe es una REPOSICION: no es demanda.
// Las mermas NO: son pérdida, no pedido, y sumarlas empujaría a comprar lo que se tira.
//
// Sin imports de servidor: lo usan la pantalla, el loader, el número del Inicio y los tests.

import { ANULACION_VENTA_ACTOR_PREFIX, EDICION_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { esDeKilo, esMovimientoDeDespiece } from "@/lib/carniceria/despiece";
import { TRASLADO_ACTOR_PREFIX } from "@/lib/multilocal/traslado-core";

/** Días de venta que se promedian. */
export const DIAS_DE_VENTA = 28;
/** Días que tarda el proveedor en entregar. Provisional a confirmar por negocio. */
export const DEMORA_DIAS = 2;
/** Cada cuántos días se hace el pedido. Provisional a confirmar por negocio. */
export const CICLO_DIAS = 7;
/** Días de venta que se guardan de colchón, si el mínimo cargado es menor. */
export const DIAS_DE_SEGURIDAD = 2;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Desde cuándo se mira la venta: 28 días para atrás. PURA. */
export function desdeVentaReciente(ahora: Date, dias = DIAS_DE_VENTA): Date {
  return new Date(ahora.getTime() - dias * MS_DIA);
}

/** Un movimiento del registro, lo que hace falta para saber si fue demanda. */
export type MovimientoDeDemanda = {
  type: string;
  /** Firmado, como en el registro: − sale, + entra. */
  qty: number;
  reason: string | null;
  createdBy: string;
};

/**
 * Cuánto se DEMANDÓ en estos movimientos (magnitud, nunca negativa). PURA.
 *   · VENTA y CONSUMO: lo que salió.
 *   · AJUSTE de una anulación o de un reajuste de pedido: se descuenta lo que volvió (o se suma
 *     lo que salió de más al reajustar al peso real). Así una venta anulada no cuenta.
 *   · AJUSTE de despiece: la pieza de entrada que se cortó.
 *   · AJUSTE de un traslado: lo que salió hacia otro local de la red.
 *   · Todo lo demás (compras, mermas, recuentos, la entrada de un traslado): no es demanda.
 */
export function demandaDe(movs: readonly MovimientoDeDemanda[]): number {
  let total = 0;
  for (const m of movs) {
    if (!Number.isFinite(m.qty)) continue;
    if (m.type === "VENTA" || m.type === "CONSUMO") {
      total += Math.abs(m.qty);
      continue;
    }
    if (m.type !== "AJUSTE") continue;
    const actor = String(m.createdBy ?? "");
    if (
      actor.startsWith(ANULACION_VENTA_ACTOR_PREFIX) ||
      actor.startsWith(EDICION_ACTOR_PREFIX) ||
      actor.startsWith(TRASLADO_ACTOR_PREFIX) ||
      esMovimientoDeDespiece(m.reason)
    ) {
      total -= m.qty; // una devolución (+) resta demanda; una salida (−) la suma
    }
  }
  return Math.max(0, redondear3(total));
}

/** Venta diaria promedio de los últimos `dias` días. PURA. */
export function ventaDiaria(movs: readonly MovimientoDeDemanda[], dias = DIAS_DE_VENTA): number {
  return dias > 0 ? redondear3(demandaDe(movs) / dias) : 0;
}

/**
 * La cantidad sugerida para pedir hoy. PURA.
 * `kilo`: se vende por peso → se redondea para arriba a la décima de kilo; por unidad → a la
 * unidad entera (no se piden 2,3 velas). Nunca negativa.
 */
export function cantidadSugerida(p: {
  ventaDiaria: number;
  stock: number;
  minimo: number;
  kilo: boolean;
  demora?: number;
  ciclo?: number;
}): number {
  const vd = Number.isFinite(p.ventaDiaria) && p.ventaDiaria > 0 ? p.ventaDiaria : 0;
  const minimo = Number.isFinite(p.minimo) && p.minimo > 0 ? p.minimo : 0;
  const stock = Number.isFinite(p.stock) ? p.stock : 0;
  const seguridad = Math.max(minimo, vd * DIAS_DE_SEGURIDAD);
  const bruto = vd * ((p.demora ?? DEMORA_DIAS) + (p.ciclo ?? CICLO_DIAS)) + seguridad - stock;
  // Se redondea sobre un valor apenas limpiado de coma flotante: 17,0000000001 no son 17,1 kg.
  const limpio = redondear3(bruto);
  if (!(limpio > 0)) return 0;
  return p.kilo ? Math.ceil(limpio * 10) / 10 : Math.ceil(limpio);
}

// ── Qué se lee (la pantalla y el número del Inicio, con el MISMO where) ─────

/**
 * Los productos que pueden pedir reposición: activos, no borrados y que CONTROLAN stock (sin
 * control de stock el "hay" no significa nada; es la misma definición de "stock bajo" de
 * Stock). Objeto plano, sin Prisma. PURA.
 */
export function whereSugerido(tenantId: string) {
  return { tenantId, deletedAt: null, active: true, trackStock: true };
}

/** Los movimientos de los últimos 28 días que pueden ser demanda (se filtran con `demandaDe`). */
export function selectDemanda(desde: Date) {
  return {
    where: { type: { in: ["VENTA" as const, "CONSUMO" as const, "AJUSTE" as const] }, createdAt: { gte: desde } },
    select: { type: true, qty: true, reason: true, createdBy: true },
  };
}

/** Un producto leído con `whereSugerido` + `selectDemanda`. */
export type ProductoParaSugerir = {
  id: string;
  name: string;
  unit: string;
  saleUnit?: string | null;
  stock: number;
  lowStockAt: number;
  stockMovements: readonly MovimientoDeDemanda[];
};

export type LineaSugerida = {
  productId: string;
  nombre: string;
  unidad: string;
  kilo: boolean;
  stock: number;
  minimo: number;
  ventaDiaria: number;
  sugerido: number;
};

/** Cada producto con su sugerido; sólo los que hay que pedir (sugerido > 0). PURA. */
export function lineasSugeridas(productos: readonly ProductoParaSugerir[]): LineaSugerida[] {
  const out: LineaSugerida[] = [];
  for (const p of productos) {
    const kilo = esDeKilo(p);
    const vd = ventaDiaria(p.stockMovements);
    const sugerido = cantidadSugerida({ ventaDiaria: vd, stock: p.stock, minimo: p.lowStockAt, kilo });
    if (sugerido > 0) {
      out.push({ productId: p.id, nombre: p.name, unidad: p.unit, kilo, stock: p.stock, minimo: p.lowStockAt, ventaDiaria: vd, sugerido });
    }
  }
  return out;
}

/** Cuántos productos hay que pedir hoy: el número del Inicio. PURA. */
export function cuantosParaPedir(productos: readonly ProductoParaSugerir[]): number {
  return lineasSugeridas(productos).length;
}

// ── Por proveedor, con el texto para WhatsApp ────────────────────────────────

export type ProveedorHabitual = { id: string; nombre: string; telefono: string | null };

export type PedidoSugerido = {
  /** `null` = los productos que nunca se le compraron a un proveedor de la lista. */
  proveedor: ProveedorHabitual | null;
  lineas: LineaSugerida[];
};

/**
 * Agrupa las líneas por el proveedor HABITUAL de cada producto (el de su última compra con
 * proveedor de la lista). Los proveedores por nombre; al final, los productos sin proveedor
 * habitual. Dentro de cada grupo, por nombre de producto. PURA.
 */
export function agruparPorProveedor(
  lineas: readonly LineaSugerida[],
  habitual: ReadonlyMap<string, ProveedorHabitual>,
): PedidoSugerido[] {
  const grupos = new Map<string, PedidoSugerido>();
  for (const l of lineas) {
    const prov = habitual.get(l.productId) ?? null;
    const clave = prov?.id ?? "";
    const g = grupos.get(clave) ?? { proveedor: prov, lineas: [] };
    g.lineas.push(l);
    grupos.set(clave, g);
  }
  const porNombre = (a: string, b: string) => a.localeCompare(b, "es");
  for (const g of grupos.values()) g.lineas.sort((a, b) => porNombre(a.nombre, b.nombre));
  return [...grupos.values()].sort((a, b) => {
    if (!a.proveedor) return 1;
    if (!b.proveedor) return -1;
    return porNombre(a.proveedor.nombre, b.proveedor.nombre);
  });
}

/** "17 kg", "3,5 kg", "12 unidades" — la cantidad como se la dice al proveedor. PURA. */
export function cantidadParaPedir(l: Pick<LineaSugerida, "sugerido" | "kilo" | "unidad">): string {
  const n = new Intl.NumberFormat("es-AR", { maximumFractionDigits: l.kilo ? 1 : 0 }).format(l.sugerido);
  const unidad = l.kilo ? "kg" : l.unidad.trim() || "unidades";
  return `${n} ${unidad}`;
}

/**
 * El texto del pedido para mandar por WhatsApp, 1 a 1 al proveedor. Sin precios ni costos (el
 * encargado no los ve y al proveedor no le hacen falta). PURA.
 */
export function textoDelPedido(negocio: string, proveedor: string | null, lineas: readonly LineaSugerida[]): string {
  const saludo = proveedor ? `Hola ${proveedor}, ` : "Hola, ";
  const quien = negocio.trim() ? ` para ${negocio.trim()}` : "";
  const renglones = lineas.map((l) => `- ${l.nombre}: ${cantidadParaPedir(l)}`);
  return [`${saludo}te paso el pedido${quien}:`, ...renglones, "¿Me confirmás cuándo llega? Gracias."].join("\n");
}

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000 + 0;
}
