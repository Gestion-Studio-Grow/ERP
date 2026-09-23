// ============================================================================
// COSTO DE LO VENDIDO — cuánto costó cada línea que se vendió. PURO.
// ============================================================================
//
// Lo usan dos apps, y por eso vive una vez: "Resultado del mes" (ventas menos lo que costó lo
// vendido menos los gastos) y "Margen" (cuánto deja cada producto). Si cada una costeara a su
// manera, el margen de agosto y el resultado de agosto no cerrarían entre sí.
//
// DE DÓNDE SALE EL COSTO DE CADA LÍNEA, en este orden:
//   1. El costo GUARDADO en la salida de stock de esa venta (`StockMovement.unitCost` del
//      movimiento VENTA del pedido). Lo estampa el registro de stock al vender (ledger.ts):
//      es el costo del día de la venta, y un cambio de costo posterior no reescribe la historia.
//   2. Si la venta no lo guardó (ventas anteriores a que se estampara, o productos que no
//      controlan stock y por eso no tienen movimiento), el COSTO VIGENTE de hoy
//      (stock/costo.ts). La pantalla dice cuántas líneas se costearon así.
//   3. Si tampoco hay costo vigente: SIN COSTO. No se inventa un $0: la línea queda afuera
//      del costo y la pantalla avisa que el resultado está inflado por esas ventas.
// Las líneas sin producto (precio a mano, envío) no tienen costo de mercadería: no son un
// faltante de dato y no se avisan como tal.
//
// Los insumos que consume un servicio (movimientos CONSUMO del turno) son el costo de lo
// vendido de un negocio de servicios, con la misma regla.
//
// Sin Prisma: recibe filas ya leídas.

import { round2 } from "@/lib/round";

/** Cómo se costeó una línea. */
export type FuenteCosto = "guardado" | "costo-de-hoy" | "sin-costo" | "sin-producto";

/** Una línea vendida de un pedido que cuenta como venta. */
export interface LineaVendida {
  orderId: string;
  productId: string | null;
  nombre: string;
  /** Kilos o unidades. */
  cantidad: number;
  saleUnit: "UNIT" | "WEIGHT";
  /** Lo que se cobró por la línea (antes del descuento del pedido, si lo hubo). */
  importe: number;
}

/** Una salida de stock del mes (venta de un pedido o consumo de un turno). */
export interface SalidaDeStock {
  type: "VENTA" | "CONSUMO";
  orderId: string | null;
  productId: string | null;
  /** FIRMADA, como la guarda el registro: negativa en una salida. */
  qty: number;
  unitCost: number | null;
}

export interface LineaCosteada extends LineaVendida {
  costo: number;
  fuente: FuenteCosto;
}

const clave = (orderId: string | null, productId: string | null) => `${orderId ?? ""}|${productId ?? ""}`;

function esCosto(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Cada línea vendida con su costo y de dónde salió. `costoVigente` es el de hoy por producto
 * (null = sin costo). Una línea con producto y con salida de stock en su pedido se costea con
 * las salidas (cantidad de la salida × su costo guardado, o × el de hoy si la salida no lo
 * trae); sin salida (el producto no controla stock), con la cantidad vendida × el costo de hoy.
 * PURA.
 */
export function costearLineas(
  lineas: readonly LineaVendida[],
  salidas: readonly SalidaDeStock[],
  costoVigente: Readonly<Record<string, number | null>>,
): LineaCosteada[] {
  // Las salidas de venta, por pedido y producto. Un producto repetido en el pedido comparte
  // salidas: se reparten entre sus líneas en proporción a la cantidad.
  const porPedidoProducto = new Map<string, { cantidad: number; costo: number; faltaCosto: boolean; sinCostoDeHoy: boolean }>();
  for (const s of salidas) {
    if (s.type !== "VENTA" || !s.orderId || !s.productId) continue;
    const cant = Math.abs(s.qty);
    if (!(cant > 0)) continue;
    const k = clave(s.orderId, s.productId);
    const acc = porPedidoProducto.get(k) ?? { cantidad: 0, costo: 0, faltaCosto: false, sinCostoDeHoy: false };
    acc.cantidad += cant;
    if (esCosto(s.unitCost)) acc.costo += cant * s.unitCost;
    else {
      acc.faltaCosto = true;
      const hoy = costoVigente[s.productId];
      if (esCosto(hoy)) acc.costo += cant * hoy;
      else acc.sinCostoDeHoy = true;
    }
    porPedidoProducto.set(k, acc);
  }
  const cantidadPorPedidoProducto = new Map<string, number>();
  for (const l of lineas) {
    if (!l.productId) continue;
    const k = clave(l.orderId, l.productId);
    cantidadPorPedidoProducto.set(k, (cantidadPorPedidoProducto.get(k) ?? 0) + Math.abs(l.cantidad));
  }

  return lineas.map((l) => {
    if (!l.productId) return { ...l, costo: 0, fuente: "sin-producto" as const };
    const k = clave(l.orderId, l.productId);
    const s = porPedidoProducto.get(k);
    if (s) {
      if (s.sinCostoDeHoy) return { ...l, costo: 0, fuente: "sin-costo" as const };
      const total = cantidadPorPedidoProducto.get(k) ?? 0;
      const parte = total > 0 ? Math.abs(l.cantidad) / total : 0;
      return { ...l, costo: round2(s.costo * parte), fuente: s.faltaCosto ? ("costo-de-hoy" as const) : ("guardado" as const) };
    }
    const hoy = costoVigente[l.productId];
    if (esCosto(hoy)) return { ...l, costo: round2(Math.abs(l.cantidad) * hoy), fuente: "costo-de-hoy" as const };
    return { ...l, costo: 0, fuente: "sin-costo" as const };
  });
}

export interface CostoInsumos {
  costo: number;
  /** Salidas de consumo que no tienen costo ni guardado ni de hoy. */
  sinCosto: number;
  /** Salidas de consumo costeadas con el costo de hoy. */
  alCostoDeHoy: number;
}

/** El costo de los insumos consumidos por los servicios del período. PURA. */
export function costearInsumos(
  salidas: readonly SalidaDeStock[],
  costoVigente: Readonly<Record<string, number | null>>,
): CostoInsumos {
  let costo = 0;
  let sinCosto = 0;
  let alCostoDeHoy = 0;
  for (const s of salidas) {
    if (s.type !== "CONSUMO") continue;
    const cant = Math.abs(s.qty);
    if (!(cant > 0)) continue;
    if (esCosto(s.unitCost)) {
      costo += cant * s.unitCost;
      continue;
    }
    const hoy = s.productId ? costoVigente[s.productId] : null;
    if (esCosto(hoy)) {
      costo += cant * hoy;
      alCostoDeHoy++;
    } else sinCosto++;
  }
  return { costo: round2(costo), sinCosto, alCostoDeHoy };
}

// ── Qué pedidos cuentan como venta ───────────────────────────────────────────

/** Un pedido no anulado del período, con lo que hace falta para decidir si es venta. */
export interface PedidoDelPeriodo {
  id: string;
  total: number;
  paid: boolean;
  items: readonly Omit<LineaVendida, "orderId">[];
}

/**
 * Los pedidos que son VENTA: cobrados, o dejados a cuenta (tienen una cuenta a cobrar viva
 * con su id). Un pedido sin cobrar y sin cuenta (el de la tienda online que todavía no se
 * pagó) no es una venta todavía. Un pedido cobrado que además tiene cuenta a cobrar cuenta
 * UNA vez, y como venta A CUENTA: la cuenta se mira primero porque Vender graba la venta "A
 * cuenta" con `paid: true` (order-core.ts: el pedido se cierra y la deuda pasa a la cuenta del
 * cliente). Mirando `paid` primero, el fiado aparecía como "venta cobrada". PURA.
 */
export function pedidosQueSonVenta(
  pedidos: readonly PedidoDelPeriodo[],
  pedidosACuenta: ReadonlySet<string>,
): { cobrados: PedidoDelPeriodo[]; aCuenta: PedidoDelPeriodo[] } {
  const cobrados: PedidoDelPeriodo[] = [];
  const aCuenta: PedidoDelPeriodo[] = [];
  for (const p of pedidos) {
    if (pedidosACuenta.has(p.id)) aCuenta.push(p);
    else if (p.paid) cobrados.push(p);
  }
  return { cobrados, aCuenta };
}

/** Las líneas de esos pedidos, con su pedido. PURA. */
export function lineasDe(pedidos: readonly PedidoDelPeriodo[]): LineaVendida[] {
  return pedidos.flatMap((p) => p.items.map((i) => ({ ...i, orderId: p.id })));
}
