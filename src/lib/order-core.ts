// Núcleo de creación de Orden — Capability POS / Orden (ADR-003, ADR-020 §6.a).
//
// Es el ÚNICO lugar donde se arma una orden + sus líneas. Vive fuera de
// `order-actions.ts` (que es "use server") a propósito: así lo pueden reusar los
// tres consumidores de la misma capability sin volverse Server Actions —
//   1. el POS del backoffice (`createOrder`, con sesión),
//   2. la vidriera pública (`placeOnlineOrder`, sin sesión),
//   3. la API pública de ingesta de front externo (superficie II de ADR-020,
//      autenticada por tenant + api-key).
//
// No audita, no revalida, no redirige, no autoriza: de eso se ocupa cada
// llamador según su contexto (una Server Action revalida; la API responde JSON).
// La excepción es el cobro por aviso de Mercado Pago (al final del archivo): no tiene una
// Server Action alrededor que deje el rastro, así que lo deja él, firmado por el pago.
// Aislamiento multi-tenant: recibe el `tenantId` ya resuelto (fail-closed
// ADR-015) y lo escribe en cada fila; cada read filtra por él.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { recordMovement } from "@/lib/stock/ledger";
import { recordCashSaleMovementInTx, type RecordCashSaleResult } from "@/lib/caja/cash-sale";
import { round2 } from "@/lib/round";
import { isUniqueViolation, isColumnMissing } from "@/lib/prisma-errors";
import { buscarFichaPorTelefono } from "@/lib/clientes/ficha-por-telefono";
import { logger } from "@/lib/logger";
import { shippingCost, type ShippingConfig } from "@/lib/storefront-shipping";
import { createReceivable } from "@/lib/debts/receivable-service";
import { audit } from "@/lib/audit-core";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { anularVentaInTx, fronteraDeVenta, type AnularVentaArgs, type AnularVentaResult } from "@/lib/order-anulacion";
import { fmtMoneyARS } from "@/components/ui/format";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  aplicarCupon,
  aplicarDescuento,
  controlarPrecioAMano,
  normalizarCodigoDeCupon,
  whereConsumoDeCupon,
  cambiosDelCuponDelPedido,
  ACCION_CUPON_DEL_PEDIDO,
  CUPON_Y_DESCUENTO,
  NOMBRE_LINEA_ENVIO,
  type CuponDelPedido,
  type LineaAMano,
  type PedidoDeDescuento,
  type TopePrecioAMano,
} from "@/lib/venta-reglas";
import type { Prisma, ProductSaleUnit } from "@/generated/prisma/client";

export type OrderPaymentMethod = "MERCADOPAGO" | "EFECTIVO" | "TRANSFERENCIA";

export type OrderInput = {
  channel: "COUNTER" | "ONLINE";
  fulfillment: "PICKUP" | "DELIVERY";
  customerName: string;
  customerPhone: string;
  address: string | null;
  notes: string | null;
  scheduledFor: Date | null;
  paid: boolean;
  paymentMethod: OrderPaymentMethod | null;
  items: { productId: string; qty: number }[];
  /**
   * Líneas con PRECIO A MANO (sin producto): ya validadas por el llamador con
   * `validarLineaAMano`. No mueven stock. Hoy sólo las manda el mostrador (/admin/vender);
   * la vidriera y la API externa no las conocen.
   */
  lineasAMano?: readonly LineaAMano[];
};

export type InsertedOrder = {
  id: string;
  code: number;
  subtotal: number;
  lines: number;
  /**
   * Lo que se cobra: subtotal menos descuento. Opcional sólo para no romper a quien arma un
   * `InsertedOrder` a mano (tests del alta): `insertOrder` lo devuelve siempre.
   */
  total?: number;
  /** Descuento en pesos (0 si no hubo). */
  descuento?: number;
  /** Ficha del cliente vinculada por teléfono, si se encontró. */
  clientId?: string | null;
  // I7 (ADR-064): resultado de la imputación a caja, presente solo si el llamador pidió
  // imputar (venta de mostrador cobrada, por cualquiera de los tres medios). El asiento se
  // hizo DENTRO de la misma tx que la orden+stock → atómico. `recorded:false` es una condición
  // benigna (no cobrada, medio que el libro no traduce, total <= 0, ya imputada), NO un fallo:
  // un fallo de DB habría abortado toda la venta. Sin turno abierto NO es `recorded:false`: se
  // asienta con `sessionId` null.
  cashSale?: RecordCashSaleResult;
  // A-1: true cuando este resultado es un pedido PREEXISTENTE devuelto por idempotencia
  // (el reintento/doble-submit NO creó un pedido nuevo ni volvió a descontar stock).
  dedup?: boolean;
  /** Costo del envío que entró como línea del pedido (0 o ausente = sin envío). */
  envio?: number;
  /** Código del cupón que se aplicó (y consumió un uso), si hubo. */
  cupon?: string | null;
};

/**
 * El cupón no se pudo usar (no existe, venció, se agotó). Lo tira el alta DENTRO de la
 * transacción, así que nada se escribe; el mensaje se muestra tal cual.
 */
export class CuponRechazado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "CuponRechazado";
  }
}

/** Una línea a mano pasó el tope de quien vende. Se tira dentro de la transacción del alta. */
export class PrecioAManoRechazado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "PrecioAManoRechazado";
  }
}

// Opciones de `insertOrder`. `imputarCajaActor` activa el asiento de caja ATÓMICO con la
// venta (I7): solo lo pasa el mostrador (venta presencial); la vidriera y la API externa no
// tocan la caja física, así que lo omiten y la orden se crea sin imputar.
// `idempotencyKey` (A-1): clave del cliente para deduplicar el doble-submit / reintento de la
// vidriera — dos envíos con la misma clave devuelven el MISMO pedido, sin crear otro ni
// re-descontar stock. La vidriera la genera por carrito; el POS/API no la usan.
//
// `permitirNegativoPorProducto` (MAG-4): ids de los productos que en ESTA venta pueden dejar
// el stock en negativo en vez de abortarla. La decisión NO se toma acá: la calcula el llamador
// con la regla `productosQuePuedenQuedarNegativos` (stock/pos-stock-rules.ts), con la unidad
// de venta leída del Product en la base. Hoy sólo la pasa `createOrder` para la venta de
// mostrador por peso. Si no llega —vidriera, ingesta externa, cualquier llamador nuevo—, la
// guarda anti-oversell vale para todas las líneas, como siempre.
//
// `descuento`: lo pide el mostrador, con el tope de quien vende (`topeDeDescuento`, null = sin
// tope). Se calcula ACÁ, sobre el subtotal armado con los precios de la base: el porcentaje
// que tipeó el cajero nunca se aplica sobre un total que mandó el navegador.
//
// `envio`: la tarifa de envío de la marca (storefront.ts). Sólo la pasa la tienda. El costo se
// calcula ACÁ, sobre lo que suman los productos a precio de la base, y entra como una línea
// más del pedido (`NOMBRE_LINEA_ENVIO`, sin producto): antes la tienda lo mostraba y el pedido
// de la bandeja no lo tenía.
//
// `cupon`: el código que escribió el cliente o el cajero. Se lee y se consume DENTRO de la
// transacción (compare-and-set sobre `usedCount`): el último uso no lo gastan dos ventas.
//
// `aCuenta`: la venta queda en la cuenta corriente del cliente (`createReceivable`, en la
// MISMA transacción): o se crean el pedido y la deuda, o nada. El pedido queda saldado y sin
// medio (`paid` true, `paymentMethod` null): no escribe el libro, porque no entró plata.
//
// `topePrecioAMano`: el tope de las líneas a mano de quien vende (null = sin tope). Se controla
// dentro de la transacción, con el catálogo leído ahí.
export type InsertOrderOpts = {
  imputarCajaActor?: string;
  idempotencyKey?: string | null;
  permitirNegativoPorProducto?: readonly string[];
  descuento?: { pedido: PedidoDeDescuento; topePct: number | null } | null;
  envio?: ShippingConfig | null;
  cupon?: string | null;
  aCuenta?: { createdBy: string } | null;
  topePrecioAMano?: TopePrecioAMano | null;
};

// A-2: cuántas veces se reintenta el alta ante una colisión del correlativo por tenant
// (max(code)+1 bajo concurrencia). Cada reintento recomputa el code; con el @@unique como
// árbitro, dos altas simultáneas se serializan en 2 correlativos distintos sin 500.
const MAX_CODE_COLLISION_RETRIES = 5;

// A-1: busca un pedido ya creado con esta clave de idempotencia (para devolverlo en vez de
// crear otro). TOLERANTE a schema-ahead: si la columna `idempotencyKey` todavía no está
// migrada (P2022), devuelve null → el alta sigue el camino de hoy (sin dedupe persistente).
async function findOrderByIdempotencyKey(
  tenantId: string,
  key: string,
): Promise<InsertedOrder | null> {
  try {
    const o = await prisma.order.findFirst({
      where: { tenantId, idempotencyKey: key },
      select: {
        id: true,
        code: true,
        subtotal: true,
        discount: true,
        total: true,
        clientId: true,
        _count: { select: { items: true } },
      },
    });
    if (!o) return null;
    return {
      id: o.id,
      code: o.code,
      subtotal: o.subtotal,
      total: o.total,
      descuento: o.discount,
      clientId: o.clientId,
      lines: o._count.items,
      dedup: true,
    };
  } catch (e) {
    if (isColumnMissing(e, "idempotencyKey")) return null;
    throw e;
  }
}

// Redondeo a 2 decimales (pesos): regla única en src/lib/round.ts (importada arriba).
// La venta por kg da importes con fracción (0.750 kg × $8900/kg); se snapshotea redondeado.

// Precio de venta vigente de un producto según cómo se vende. WEIGHT → precio/kg;
// UNIT → precio unitario. Devuelve null si el producto no tiene precio cargado
// (no se puede vender suelto todavía) para que la acción lo descarte.
export function sellPrice(p: {
  saleUnit: string;
  price: number | null;
  pricePerKg: number | null;
}): number | null {
  return p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
}

// Producto del tenant tal como lo trae `insertOrder` (snapshot de venta).
export type OrderProduct = {
  id: string;
  name: string;
  saleUnit: ProductSaleUnit;
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
};

// Línea de orden ya armada: precio y nombre congelados al momento de la venta.
export type OrderLine = {
  productId: string;
  name: string;
  saleUnit: ProductSaleUnit;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  trackStock: boolean;
};

// Arma las líneas de la orden a partir de los ítems pedidos y los productos
// reales del tenant. Lógica pura (sin DB): snapshotea precio/nombre (ADR-009 §4),
// descarta los ítems cuyo producto no existe (no es del tenant / borrado / inactivo)
// o no tiene precio de venta cargado (null o <= 0). El total de línea se redondea
// a 2 decimales. No confía en el input: precio y nombre salen del producto real.
export function buildOrderLines(
  products: OrderProduct[],
  wanted: { productId: string; qty: number }[],
): OrderLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return wanted
    .map((l) => {
      const p = byId.get(l.productId);
      if (!p) return null;
      const unitPrice = sellPrice(p);
      if (unitPrice == null || unitPrice <= 0) return null;
      return {
        productId: p.id,
        name: p.name,
        saleUnit: p.saleUnit,
        quantity: l.qty,
        unitPrice,
        lineTotal: round2(l.qty * unitPrice),
        trackStock: p.trackStock,
      };
    })
    .filter((l): l is OrderLine => l !== null);
}

// Subtotal de la orden: suma de los totales de línea, redondeada a 2 decimales.
export function orderSubtotal(lines: OrderLine[]): number {
  return round2(lines.reduce((s, l) => s + l.lineTotal, 0));
}

// Líneas que requieren descontar stock: solo las de productos con `trackStock`.
// Las demás (insumos de spa, retail sin stock cargado) se venden sin bloqueo.
export function stockDecrementLines(lines: readonly OrderLine[]): OrderLine[] {
  return lines.filter((l) => l.trackStock);
}

// Regla anti-oversell: ¿alcanza el stock disponible para vender `quantity`?
// Espeja EXACTAMENTE la guarda atómica del WHERE (`stock: { gte: quantity }`):
// solo se puede descontar si el disponible es >= la cantidad pedida. Nunca deja
// stock negativo ni permite ventas parciales. Vender 0/negativo no consume stock.
export function canDecrementStock(available: number, quantity: number): boolean {
  return quantity > 0 && available >= quantity;
}

// Las líneas pedidas que cuentan: con producto y con cantidad positiva y finita.
function pedidasValidas(items: OrderInput["items"]): { productId: string; qty: number }[] {
  return items.filter((l) => l.productId && Number.isFinite(l.qty) && l.qty > 0);
}

/** Lo que el alta decide ANTES de abrir la transacción (sin la ficha ni la clave). */
export type AltaDecidida = Omit<DatosDelAlta, "clientId" | "writeKey">;

/**
 * Líneas, subtotal, descuento, total y estado del alta, con los productos ya leídos de la
 * base. PURA: un test la corre y le pasa el resultado a `crearOrdenEnTx` e `imputarVentaEnTx`,
 * así que lo que fija ese test es el cableado REAL del alta y no una copia armada a mano.
 *
 * EL TOTAL ES SUBTOTAL MENOS DESCUENTO y es lo que asienta el libro. Antes el alta le pasaba el
 * subtotal a la caja: con un 10 % de descuento, el arqueo esperaba plata que no entró.
 *
 * El descuento se calcula ACÁ, sobre el subtotal armado con los precios de la base y con el
 * tope de quien vende: un rechazo (el 15 % de recepción, un descuento mayor que la venta) sale
 * como error con su motivo y no se escribe nada.
 *
 * EL ENVÍO (sólo la tienda) se calcula sobre lo que suman los productos y SUMA al subtotal
 * como una línea más; el descuento no lo toca (se descuenta lo que se compra, no el envío). El
 * CUPÓN se valida y se consume dentro de la transacción (`aplicarCuponEnTx`): acá sólo se
 * anota el código pedido y se rechaza la combinación con un descuento a mano.
 */
export function decidirAlta(p: {
  tenantId: string;
  input: OrderInput;
  products: OrderProduct[];
  opts?: Pick<InsertOrderOpts, "descuento" | "imputarCajaActor" | "envio" | "cupon" | "aCuenta">;
}): AltaDecidida {
  const lines = buildOrderLines(p.products, pedidasValidas(p.input.items));
  const aMano = p.input.lineasAMano ?? [];
  if (lines.length === 0 && aMano.length === 0) {
    throw new Error("Ninguno de los productos elegidos tiene precio de venta cargado.");
  }
  // Lo que se compra: las líneas con producto (precio de la base) más las de precio a mano.
  const productos = round2(orderSubtotal(lines) + aMano.reduce((s, l) => s + l.importe, 0));
  const cupon = normalizarCodigoDeCupon(p.opts?.cupon) || null;
  if (cupon && p.opts?.descuento?.pedido) throw new Error(CUPON_Y_DESCUENTO);
  const desc = aplicarDescuento({
    subtotal: productos,
    pedido: p.opts?.descuento?.pedido ?? null,
    topePct: p.opts?.descuento?.topePct ?? null,
  });
  if (!desc.ok) throw new Error(desc.error);
  const envio = p.opts?.envio ? round2(shippingCost(productos, p.input.fulfillment, p.opts.envio)) : 0;
  const subtotal = round2(productos + envio);
  return {
    tenantId: p.tenantId,
    status: p.input.channel === "ONLINE" ? "PENDING" : "CONFIRMED",
    input: p.input,
    subtotal,
    descuento: desc.descuento,
    total: round2(subtotal - desc.descuento),
    lines,
    aMano,
    imputarCajaActor: p.opts?.imputarCajaActor,
    // Lo nuevo sólo aparece cuando existe: el alta de siempre devuelve lo mismo que antes.
    ...(envio > 0 ? { envio } : {}),
    ...(cupon ? { cupon } : {}),
    ...(p.opts?.aCuenta ? { aCuenta: p.opts.aCuenta } : {}),
  };
}

// ── El freno de «Aplicar» cupón ─────────────────────────────────────────────
//
// Probar un cupón es público (la tienda no tiene sesión) y contesta si un código existe: sin
// freno, alguien podría probar códigos de a miles hasta dar con uno. Se cuentan los códigos que
// NO existen, por negocio y por IP: 10 en 10 minutos, y hasta que se libere la ventana se
// contesta que espere. Un código que existe (aunque esté vencido o agotado) no suma: el cliente
// que se equivoca una letra no se traba. En memoria y por proceso, como el freno del login
// (rate-limit.ts dice por qué hoy alcanza).

export const REGLA_CUPONES_INEXISTENTES = { max: 10, windowMs: 10 * 60 * 1000 };

export const CUPON_FRENADO = "Probaste muchos códigos seguidos. Esperá unos minutos y volvé a intentar.";

export function crearFrenoDeCupones(now: () => number = Date.now) {
  const limitador = createRateLimiter(REGLA_CUPONES_INEXISTENTES, now);
  const clave = (tenantId: string, ip: string | null | undefined) => `cupon:${tenantId}:${ip || "sin-ip"}`;
  return {
    frenado: (tenantId: string, ip: string | null | undefined) => limitador.blocked(clave(tenantId, ip)),
    inexistente: (tenantId: string, ip: string | null | undefined) => limitador.fail(clave(tenantId, ip)),
  };
}

/** El freno que usa `probarCuponEnPedido` (coupon-actions.ts). */
export const frenoDeCupones = crearFrenoDeCupones();

/**
 * El cupón del alta, DENTRO de su transacción: se lee, se decide con `aplicarCupon` y se
 * consume con un compare-and-set sobre el `usedCount` leído (`whereConsumoDeCupon`). Si otra
 * venta gastó un uso en el medio, el `updateMany` no encuentra la fila y se vuelve a leer: con
 * el máximo alcanzado, la segunda lectura rechaza. Devuelve el alta con el descuento y el total
 * del cupón. Sin cupón pedido, devuelve el alta tal cual.
 *
 * El descuento se calcula sobre lo que se compra (subtotal menos envío), como el descuento a
 * mano. Tira `CuponRechazado`: la transacción se deshace entera y el pedido no se crea.
 *
 * Devuelve también la REGLA del cupón (`cuponDelPedido`: % o fijo, y su valor), que el alta
 * escribe con `registrarCuponDelPedidoEnTx` para que «Pesar y ajustar» la vuelva a aplicar.
 */
export async function aplicarCuponEnTx<T extends Pick<DatosDelAlta, "tenantId" | "subtotal" | "envio" | "cupon" | "descuento" | "total">>(
  tx: Prisma.TransactionClient,
  alta: T,
  ahora: Date,
): Promise<T & { cuponAplicado?: string; cuponDelPedido?: CuponDelPedido }> {
  if (!alta.cupon) return alta;
  const base = round2(alta.subtotal - (alta.envio ?? 0));
  for (let intento = 0; intento < 3; intento++) {
    const c = await tx.coupon.findFirst({
      where: { tenantId: alta.tenantId, code: alta.cupon },
      select: { id: true, code: true, type: true, value: true, active: true, expiresAt: true, maxUses: true, usedCount: true },
    });
    const r = aplicarCupon({ cupon: c, base, ahora });
    if (!r.ok || !c) throw new CuponRechazado(r.ok ? "Ese cupón no existe o no está activo." : r.error);
    const consumo = await tx.coupon.updateMany({
      where: whereConsumoDeCupon(alta.tenantId, c),
      data: { usedCount: { increment: 1 } },
    });
    if (consumo.count === 1) {
      return {
        ...alta,
        descuento: r.descuento,
        total: round2(alta.subtotal - r.descuento),
        cuponAplicado: r.codigo,
        // El tipo con la misma lectura que `montoDeCupon`: lo que no es PERCENT es monto fijo.
        cuponDelPedido: { codigo: r.codigo, tipo: c.type === "PERCENT" ? "PERCENT" : "FIXED", valor: c.value },
      };
    }
  }
  throw new CuponRechazado("Ese cupón se está usando en otra compra en este mismo momento: probá de nuevo.");
}

/**
 * La regla del cupón del pedido, escrita DENTRO de la transacción del alta. `Order.discount`
 * guarda sólo el monto, y «Pesar y ajustar» necesita saber si el cupón era de % o de monto
 * fijo para recalcularlo (`descuentoDelAjuste`, venta-reglas.ts). Va en la misma tx que el
 * pedido a propósito: la auditoría de siempre del alta ("create") se escribe DESPUÉS y es
 * best-effort (`audit` nunca tira), y la plata del ajuste no puede depender de una fila que
 * puede faltar. Si el alta se deshace, esta fila tampoco queda. Sin cupón, no escribe nada.
 */
export async function registrarCuponDelPedidoEnTx(
  tx: Prisma.TransactionClient,
  d: { tenantId: string; orderId: string; cupon: CuponDelPedido | undefined; monto: number },
): Promise<void> {
  if (!d.cupon) return;
  await tx.auditLog.create({
    data: {
      tenantId: d.tenantId,
      actor: "system",
      action: ACCION_CUPON_DEL_PEDIDO,
      entity: "Order",
      entityId: d.orderId,
      changes: cambiosDelCuponDelPedido(d.cupon, d.monto),
    },
  });
}

/**
 * El tope de las líneas a mano de quien vende, DENTRO de la transacción del alta: el catálogo
 * se lee acá (sólo si hay líneas a mano y quien vende tiene tope) y la regla es la pura de
 * venta-reglas.ts. Tira `PrecioAManoRechazado` con el mensaje de la primera línea que no entra.
 */
export async function controlarPreciosAManoEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  aMano: readonly LineaAMano[],
  tope: TopePrecioAMano | null | undefined,
): Promise<void> {
  if (!tope || aMano.length === 0) return;
  const catalogo = await tx.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { name: true, saleUnit: true, price: true, pricePerKg: true },
  });
  for (const linea of aMano) {
    const r = controlarPrecioAMano({ linea, catalogo, tope });
    if (!r.ok) throw new PrecioAManoRechazado(r.error);
  }
}

// Valida, snapshotea precios y crea la orden + sus líneas en una transacción.
// Snapshot de precio/nombre al momento de la venta (ADR-009 §4): trae el producto
// real del tenant y congela lo cobrado, no confía en el input.
export async function insertOrder(
  tenantId: string,
  input: OrderInput,
  opts?: InsertOrderOpts,
): Promise<InsertedOrder> {
  if (input.fulfillment === "DELIVERY" && !input.address) {
    throw new Error("Para envío a domicilio hace falta la dirección.");
  }

  const wanted = pedidasValidas(input.items);
  if (wanted.length === 0 && (input.lineasAMano ?? []).length === 0) {
    throw new Error("Agregá al menos un producto con cantidad al pedido.");
  }

  const products = wanted.length
    ? await prisma.product.findMany({
        where: { id: { in: wanted.map((l) => l.productId) }, tenantId, deletedAt: null, active: true },
        select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, trackStock: true },
      })
    : [];
  // Líneas, subtotal, envío, descuento (con el tope de quien vende) y total: `decidirAlta`.
  const alta = decidirAlta({ tenantId, input, products, opts });

  const negativoPermitido = new Set(opts?.permitirNegativoPorProducto ?? []);
  const clientId = await clienteDelTelefono(tenantId, input.customerPhone);
  // "A cuenta" es la deuda de ALGUIEN: sin ficha no hay a quién cobrarle después.
  if (alta.aCuenta && !clientId) {
    throw new Error(
      "Para dejar la venta a cuenta, el cliente tiene que tener ficha: buscalo por su teléfono " +
        "(o dalo de alta en Clientes) y volvé a intentar.",
    );
  }

  // Toda la orquestación de guardas (A-1 idempotencia + A-2 colisión de correlativo + tolerancia
  // schema-ahead) vive en `insertOrderGuarded`, con las operaciones de DB INYECTADAS para poder
  // testearla sin DB (ADR-026). Acá solo se arma el `runInsert` real: la tx que crea la orden,
  // descuenta stock e imputa caja (todo-o-nada, I7): la orden la arma `crearOrdenEnTx`, el stock
  // se descuenta acá mismo y el libro lo asienta `imputarVentaEnTx`.
  const r = await insertOrderGuarded({
    idempotencyKey: opts?.idempotencyKey?.trim() || null,
    subtotal: alta.subtotal,
    total: alta.total,
    lineCount: alta.lines.length + alta.aMano.length + (alta.envio ? 1 : 0),
    findByKey: (key) => findOrderByIdempotencyKey(tenantId, key),
    runInsert: (writeKey) =>
      tenantTransaction(async (tx) => {
        // El tope de precio a mano y el cupón se deciden ACÁ, con lo que la base dice en esta
        // misma transacción: si alguno rechaza, no se escribe nada.
        await controlarPreciosAManoEnTx(tx, tenantId, alta.aMano, opts?.topePrecioAMano);
        const conCupon = await aplicarCuponEnTx(tx, alta, new Date());
        const datos: DatosDelAlta = { ...conCupon, clientId, writeKey };
        const created = await crearOrdenEnTx(tx, datos);
        // La regla del cupón (% o fijo), para poder pesar y ajustar el pedido sin inventarla.
        await registrarCuponDelPedidoEnTx(tx, {
          tenantId,
          orderId: created.id,
          cupon: datos.cuponDelPedido,
          monto: datos.descuento,
        });

        // Descuento de stock al vender (POS/stock), SOLO para productos con `trackStock`.
        // Pasa por el ledger (`recordMovement`): baja condicional atómica con la MISMA
        // guarda anti-oversell (si el stock ya no alcanza porque otra venta se adelantó,
        // afecta 0 filas y lanza, abortando toda la orden — nada de ventas parciales ni
        // stock negativo) Y registra el StockMovement (VENTA) en la misma transacción.
        // Corre DENTRO de la tx de la orden: o se vende, se descuenta y se asienta, o nada.
        // Las líneas con precio a mano no están en `lines`: no tienen producto que descontar.
        //
        // Única excepción a la guarda: las líneas que el llamador marcó explícitamente en
        // `permitirNegativoPorProducto` (MAG-4, el corte por kg vendido en mostrador). Ésas
        // descuentan aunque el stock quede en negativo, con su VENTA normal en el ledger.
        for (const l of stockDecrementLines(alta.lines)) {
          await recordMovement(tx, {
            tenantId,
            productId: l.productId,
            type: "VENTA",
            qty: l.quantity,
            orderId: created.id,
            createdBy: "system",
            label: l.name,
            allowNegative: negativoPermitido.has(l.productId),
          });
        }

        // A cuenta: la deuda del cliente nace en la MISMA transacción que la venta (2D pasó
        // `createReceivable` a recibir el `tx` para esto). Si falla, no queda la venta sin deuda.
        if (datos.aCuenta && datos.clientId) {
          await createReceivable(tx, tenantId, {
            clientId: datos.clientId,
            amount: datos.total,
            concept: `Venta #${created.code}`,
            orderId: created.id,
            createdBy: datos.aCuenta.createdBy,
          });
        }

        const cashSale = await imputarVentaEnTx(tx, datos, created);
        return {
          id: created.id,
          code: created.code,
          cashSale,
          total: datos.total,
          descuento: datos.descuento,
          cupon: datos.cuponAplicado ?? null,
        };
      }, { tenantId }),
  });
  if (r.dedup) return r;
  return {
    ...r,
    descuento: r.descuento ?? alta.descuento,
    clientId,
    ...(alta.envio ? { envio: alta.envio } : {}),
  };
}

/**
 * La ficha del cliente con ese teléfono, para completar `Order.clientId`. En los TRES caminos
 * del alta (mostrador, vidriera y API externa): el pedido online de alguien que ya es cliente
 * queda en su ficha, sin que nadie lo vincule a mano. Sólo VINCULA una ficha que existe —el
 * mismo criterio de "una clienta, una ficha" de los turnos (`buscarFichaPorTelefono`)—; crear
 * fichas desde la tienda es trabajo de la app de Clientes.
 *
 * Nunca frena una venta: si la búsqueda falla, el pedido sale sin ficha y queda en el log.
 */
async function clienteDelTelefono(tenantId: string, telefono: string): Promise<string | null> {
  if (!telefono.trim()) return null;
  try {
    const ficha = await buscarFichaPorTelefono(prisma, tenantId, telefono);
    return ficha?.id ?? null;
  } catch (err) {
    logger.warn("pedidos", "no se pudo vincular el pedido con la ficha del cliente", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Todo lo que el alta ya decidió antes de abrir la transacción. */
export type DatosDelAlta = {
  tenantId: string;
  status: "PENDING" | "CONFIRMED";
  input: OrderInput;
  clientId: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  lines: readonly OrderLine[];
  aMano: readonly LineaAMano[];
  imputarCajaActor?: string;
  writeKey: string | null;
  /** Costo del envío (la tienda), que entra como línea sin producto. Ausente o 0 = sin envío. */
  envio?: number;
  /** Código de cupón pedido (normalizado). Lo valida y consume `aplicarCuponEnTx`. */
  cupon?: string | null;
  /** El código del cupón que efectivamente se aplicó (lo pone `aplicarCuponEnTx`). */
  cuponAplicado?: string;
  /** La regla de ese cupón (% o fijo), que escribe `registrarCuponDelPedidoEnTx`. */
  cuponDelPedido?: CuponDelPedido;
  /** La venta queda en la cuenta corriente del cliente: saldada, sin medio y sin libro. */
  aCuenta?: { createdBy: string } | null;
};

/**
 * La orden y sus líneas, dentro de la transacción del alta. Recibe el `tx` para que un test la
 * corra con una base falsa y vea QUÉ se escribe. No decide nada: todo llega resuelto.
 */
export async function crearOrdenEnTx(
  tx: Prisma.TransactionClient,
  d: DatosDelAlta,
): Promise<{ id: string; code: number }> {
  const { tenantId, input } = d;
  // Correlativo legible por tenant: max(code)+1. Bajo concurrencia dos altas pueden
  // calcular el MISMO code; el @@unique([tenantId, code]) hace fallar a la 2ª con P2002
  // y `insertOrderGuarded` recomputa el code. `tenantTransaction` NO reintenta P2002 (solo
  // P2034), por eso el retry de correlativo vive en la orquestación de afuera.
  const last = await tx.order.findFirst({
    where: { tenantId },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const code = (last?.code ?? 0) + 1;

  const created = await tx.order.create({
    data: {
      tenantId,
      code,
      status: d.status,
      channel: input.channel,
      fulfillment: input.fulfillment,
      // La ficha sólo se escribe si se encontró: sin teléfono (la venta anónima de mostrador)
      // el alta es la misma de siempre.
      ...(d.clientId ? { clientId: d.clientId } : {}),
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      address: input.address,
      notes: input.notes,
      scheduledFor: input.scheduledFor,
      subtotal: d.subtotal,
      discount: d.descuento,
      total: d.total,
      // A cuenta: saldada contra la cuenta corriente, SIN medio. `paid` en true la saca de la
      // bandeja (no es "a cobrar" en el mostrador: se cobra desde Cuentas a cobrar) y sin medio
      // el libro no asienta nada, porque no entró plata.
      paymentMethod: d.aCuenta ? null : input.paid ? input.paymentMethod : null,
      paid: d.aCuenta ? true : input.paid && input.paymentMethod != null,
      // A-1: la clave solo se ESCRIBE si la tenemos. Cuando es null se OMITE el campo
      // (no se referencia la columna) → el POS/API y el fallback schema-ahead siguen
      // funcionando aunque la columna no exista todavía en la DB.
      ...(d.writeKey ? { idempotencyKey: d.writeKey } : {}),
      items: {
        create: [
          ...d.lines.map((l) => ({
            tenantId,
            productId: l.productId,
            name: l.name,
            saleUnit: l.saleUnit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
          // Precio a mano: SIN producto (no mueve stock) y por unidad. La línea sin
          // `productId` es la marca que ve Ventas del día; el motivo queda en la auditoría.
          ...d.aMano.map((l) => ({
            tenantId,
            productId: null,
            name: l.nombre,
            saleUnit: "UNIT" as const,
            quantity: 1,
            unitPrice: l.importe,
            lineTotal: l.importe,
          })),
          // El envío de la tienda: sin producto, por su nombre reservado (`esLineaDeEnvio`), no
          // mueve stock y suma al total como cualquier otra línea.
          ...(d.envio && d.envio > 0
            ? [
                {
                  tenantId,
                  productId: null,
                  name: NOMBRE_LINEA_ENVIO,
                  saleUnit: "UNIT" as const,
                  quantity: 1,
                  unitPrice: d.envio,
                  lineTotal: d.envio,
                },
              ]
            : []),
        ],
      },
    },
    select: { id: true, code: true },
  });

  return { id: created.id, code: created.code };
}

/**
 * El asiento de la venta en el libro de caja, dentro de la MISMA transacción del alta.
 *
 * I7 (ADR-064): FRONTERA ATÓMICA de la venta al contado. Si el mostrador cobró —en
 * efectivo, MP o transferencia—, el asiento de caja va en ESTA MISMA tx (no en una
 * segunda tx best-effort): o se crea la orden, se descuenta el stock y se asienta la
 * caja, o NADA. Así el arqueo nunca queda con la venta cobrada pero sin su movimiento
 * (ni al revés). El helper self-gatea (no cobrada / sin medio / total<=0 →
 * recorded:false, benigno) y NO lanza salvo por un error real de DB, que aborta toda
 * la venta (la atomicidad que pide I7). Sólo lo pide el mostrador (`imputarCajaActor`).
 *
 * EL LIBRO ASIENTA EL TOTAL, NO EL SUBTOTAL. Con descuento son números distintos: asentar el
 * subtotal metía en el libro plata que no entró, y el arqueo mostraba un sobrante falso por
 * el importe descontado. Lo fija un test que corre esta función con una base falsa.
 */
export async function imputarVentaEnTx(
  tx: Prisma.TransactionClient,
  d: DatosDelAlta,
  creada: { id: string; code: number },
): Promise<RecordCashSaleResult | undefined> {
  if (!d.imputarCajaActor) return undefined;
  return recordCashSaleMovementInTx(tx, d.tenantId, {
    orderId: creada.id,
    orderCode: creada.code,
    paid: d.input.paid && d.input.paymentMethod != null,
    paymentMethod: d.input.paid ? d.input.paymentMethod : null,
    total: d.total,
    actor: d.imputarCajaActor,
  });
}

/**
 * Orquestación de las guardas del alta de orden, con las operaciones de DB INYECTADAS
 * (ADR-026 — testeable sin DB). Combina:
 *  - A-1 (idempotencia): camino rápido por clave + resolución de la carrera de dos envíos
 *    simultáneos (el 2º choca el @@unique → se devuelve el pedido ganador), con tolerancia a
 *    schema-ahead (si la columna no existe, se reintenta SIN clave).
 *  - A-2 (colisión de correlativo): reintenta el alta ante un choque del `code` (max+1 bajo
 *    concurrencia), recomputando el correlativo, hasta `maxCodeRetries` veces.
 *
 * Las predicados de clasificación de error son inyectables para que los tests usen errores
 * comunes en vez de instancias reales de Prisma.
 */
export async function insertOrderGuarded(params: {
  idempotencyKey: string | null;
  subtotal: number;
  /** Lo que se cobra (subtotal menos descuento). Sin él, es el subtotal. */
  total?: number;
  lineCount: number;
  findByKey: (key: string) => Promise<InsertedOrder | null>;
  /**
   * El alta real. Si devuelve `total`/`descuento`/`cupon`, mandan sobre los de afuera: el cupón
   * se decide DENTRO de la transacción y cambia el total que se decidió antes de abrirla.
   */
  runInsert: (writeKey: string | null) => Promise<{
    id: string;
    code: number;
    cashSale?: RecordCashSaleResult;
    total?: number;
    descuento?: number;
    cupon?: string | null;
  }>;
  maxCodeRetries?: number;
  isMissingKeyColumn?: (e: unknown) => boolean;
  isKeyConflict?: (e: unknown) => boolean;
  isCodeConflict?: (e: unknown) => boolean;
}): Promise<InsertedOrder> {
  const {
    idempotencyKey,
    subtotal,
    total = subtotal,
    lineCount,
    findByKey,
    runInsert,
    maxCodeRetries = MAX_CODE_COLLISION_RETRIES,
    isMissingKeyColumn = (e) => isColumnMissing(e, "idempotencyKey"),
    isKeyConflict = (e) => isUniqueViolation(e, "idempotencyKey"),
    isCodeConflict = (e) => isUniqueViolation(e, "code"),
  } = params;

  // A-1: camino rápido idempotente — si ya hay un pedido con esta clave, devolverlo tal cual
  // (el doble-submit/reintento NO crea otro ni vuelve a descontar stock).
  if (idempotencyKey) {
    const prior = await findByKey(idempotencyKey);
    if (prior) return prior;
  }

  // `writeKey` cae a null si la columna todavía no está migrada (schema-ahead): en ese caso se
  // reintenta el alta SIN la clave (comportamiento idéntico al de hoy en prod).
  let writeKey = idempotencyKey;

  for (let attempt = 0; ; attempt++) {
    try {
      const created = await runInsert(writeKey);
      return {
        id: created.id,
        code: created.code,
        subtotal,
        total: created.total ?? total,
        lines: lineCount,
        cashSale: created.cashSale,
        ...(created.descuento !== undefined ? { descuento: created.descuento } : {}),
        ...(created.cupon ? { cupon: created.cupon } : {}),
      };
    } catch (e) {
      // Schema-ahead: columna `idempotencyKey` no migrada (P2022) → reintentar SIN la clave (el
      // pedido se crea igual; se pierde solo el dedupe persistente, que la capa del botón cubre).
      if (writeKey && isMissingKeyColumn(e)) {
        writeKey = null;
        continue;
      }
      // A-1: carrera real de dos envíos con la MISMA clave → el 2º choca el @@unique de
      // idempotencia → devolvemos el pedido ganador (idempotente, sin 2º pedido ni 2º descuento).
      if (writeKey && isKeyConflict(e)) {
        const winner = await findByKey(writeKey);
        if (winner) return winner;
      }
      // A-2: colisión del correlativo → reintentar (recomputa max(code)+1), acotado.
      if (attempt < maxCodeRetries && isCodeConflict(e)) {
        continue;
      }
      throw e;
    }
  }
}

/** El pedido ya tomado con esta clave anti-duplicado, o null (`findOrderByIdempotencyKey`). */
export function pedidoConClave(tenantId: string, key: string): Promise<InsertedOrder | null> {
  return findOrderByIdempotencyKey(tenantId, key);
}

/**
 * ¿Es un rechazo de negocio del alta (un `Error` pelado con un texto para la persona) y no un
 * error de la base? Los de Prisma son subclases con su código: ésos no se muestran.
 */
export function esRechazoDelAlta(err: unknown): err is Error {
  return err instanceof Error && Object.getPrototypeOf(err) === Error.prototype && Boolean(err.message);
}

export type ResultadoPedidoOnline =
  /** Se tomó el pedido; `dedup` en true si ya estaba tomado con esa clave (un reintento). */
  | { tipo: "tomado"; pedido: InsertedOrder }
  /** Hay líneas que no se pueden pedir así: el aviso de cada una, por producto. */
  | { tipo: "bolsa"; porLinea: Record<string, string> }
  | { tipo: "cupon"; error: string }
  /** Un rechazo del alta con texto para el cliente (sin precio, sin dirección). */
  | { tipo: "rechazo"; error: string }
  /** Un error de la base: su texto es para el log, no para el cliente. */
  | { tipo: "error"; err: unknown };

/**
 * El orden de las guardas de un pedido de la tienda (`placeOnlineOrder`), con las operaciones
 * INYECTADAS para poder ejecutarlo en un test (ADR-026):
 *
 *   1. LA CLAVE ANTI-DUPLICADO PRIMERO. Si ya hay un pedido con esta clave, es un reintento
 *      (doble toque, red que se cortó después del alta): se devuelve ESE pedido sin mirar la
 *      bolsa. Si la bolsa se mirara antes, el reintento de un pedido que se llevó el último
 *      kilo contestaría "no nos alcanza" y el cliente creería que no pidió nada.
 *   2. La bolsa línea por línea: lo que no se puede pedir vuelve con su aviso al lado.
 *   3. El alta, que es la guarda que manda (atómica). Si aborta, se vuelve a mirar la bolsa:
 *      otra compra pudo llevarse lo último entre 2 y 3, y se dice cuál línea fue.
 */
export async function tomarPedidoOnlineGuarded(ops: {
  idempotencyKey: string | null;
  buscarPorClave: (key: string) => Promise<InsertedOrder | null>;
  revisarBolsa: () => Promise<Record<string, string>>;
  insertar: () => Promise<InsertedOrder>;
}): Promise<ResultadoPedidoOnline> {
  if (ops.idempotencyKey) {
    const previo = await ops.buscarPorClave(ops.idempotencyKey);
    if (previo) return { tipo: "tomado", pedido: previo };
  }
  const problemas = await ops.revisarBolsa();
  if (Object.keys(problemas).length > 0) return { tipo: "bolsa", porLinea: problemas };
  try {
    return { tipo: "tomado", pedido: await ops.insertar() };
  } catch (err) {
    if (err instanceof CuponRechazado) return { tipo: "cupon", error: err.message };
    const otraVez = await ops.revisarBolsa().catch(() => ({}) as Record<string, string>);
    if (Object.keys(otraVez).length > 0) return { tipo: "bolsa", porLinea: otraVez };
    if (esRechazoDelAlta(err)) return { tipo: "rechazo", error: err.message };
    return { tipo: "error", err };
  }
}

// ============================================================================
// COBRAR UN PEDIDO — el mismo cobro para el botón «Cobrar» y para el aviso de Mercado Pago.
// ============================================================================
//
// Vivía adentro de `setOrderPaidCore` (order-actions.ts, "use server"), atado a la sesión. El
// aviso de pago de Mercado Pago no tiene sesión y tiene que cobrar EXACTAMENTE igual: sólo lo
// que no estaba cobrado, rechazando lo anulado y con el asiento en el libro en la misma
// transacción. Por eso el cuerpo de la transacción vive acá y lo usan los dos.

/** Cobrar un pedido que otra pestaña ya anuló metía en la caja la plata de una venta inexistente. */
export class CobroDePedidoAnulado extends Error {
  constructor(code: number) {
    super(`El pedido #${code} está anulado: no se cobra.`);
    this.name = "CobroDePedidoAnulado";
  }
}

export type CobroDePedido =
  | { tipo: "cobrado"; order: { id: string; code: number; total: number } }
  | { tipo: "ya-cobrado"; code: number; medioRegistrado: string | null }
  | { tipo: "no-existe" };

/**
 * Marca cobrado y asienta en el libro, dentro de la transacción del llamador (I7, ADR-064).
 *
 * SÓLO SE COBRA LO QUE NO ESTABA COBRADO: `updateMany` con `paid: false` en el filtro. El
 * segundo cobro (otra pestaña, el mismo aviso de Mercado Pago repetido) no toca nada y sale por
 * "ya-cobrado": el asiento VENTA es uno por pedido. El anulado se mira DESPUÉS del update a
 * propósito: la fila ya quedó bloqueada y una anulación en paralelo espera a que esto termine.
 */
export async function cobrarPedidoEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  args: { orderId: string; method: OrderPaymentMethod; actor: string },
): Promise<CobroDePedido> {
  const res = await tx.order.updateMany({
    where: { id: args.orderId, tenantId, paid: false },
    data: { paid: true, paymentMethod: args.method },
  });
  const order = await tx.order.findFirst({
    where: { id: args.orderId, tenantId },
    select: { id: true, code: true, total: true, paymentMethod: true, status: true },
  });
  if (!order) return { tipo: "no-existe" };
  if (order.status === "CANCELLED") throw new CobroDePedidoAnulado(order.code);
  if (res.count === 0) return { tipo: "ya-cobrado", code: order.code, medioRegistrado: order.paymentMethod };
  await recordCashSaleMovementInTx(tx, tenantId, {
    orderId: order.id,
    orderCode: order.code,
    paid: true,
    paymentMethod: args.method,
    total: order.total,
    actor: args.actor,
  });
  return { tipo: "cobrado", order: { id: order.id, code: order.code, total: order.total } };
}

// ── El aviso de pago de Mercado Pago ─────────────────────────────────────────

export type AvisoDePagoDePedido = {
  tenantId: string;
  orderId: string;
  /** Id del pago en Mercado Pago: firma el cobro (`mercadopago:<id>`) y queda en el rastro. */
  paymentId: string;
  /** Lo que Mercado Pago dice que se pagó. */
  monto: number;
};

export type MotivoAvisoNoCobrado = "no-existe" | "ya-cobrado" | "anulado" | "monto-distinto" | "dia-cerrado";

export type ResultadoAvisoDePedido =
  | { cobrado: true; code: number; total: number }
  | { cobrado: false; motivo: MotivoAvisoNoCobrado; detalle: string; code?: number };

/**
 * ¿Este aviso cobra el pedido? PURA.
 *
 * El monto del link sale de la base (`Order.total`), así que el pago tiene que coincidir al
 * centavo. Si no coincide —el pedido se pesó y ajustó después de mandar el link—, NO se cobra
 * solo: el pedido queda a cobrar y la bandeja lo muestra; cobrar por un monto que no es el del
 * pedido dejaría el libro diciendo una cosa y Mercado Pago otra.
 */
export function decidirCobroPorAviso(input: {
  pedido: { code: number; total: number; paid: boolean; status: string } | null;
  monto: number;
}): { cobrar: true } | { cobrar: false; motivo: MotivoAvisoNoCobrado; detalle: string } {
  const p = input.pedido;
  if (!p) return { cobrar: false, motivo: "no-existe", detalle: "El pago no corresponde a un pedido de este negocio." };
  if (p.status === "CANCELLED") {
    return {
      cobrar: false,
      motivo: "anulado",
      detalle: `El pedido #${p.code} está anulado y llegó un pago de Mercado Pago: hay que devolverlo desde Mercado Pago.`,
    };
  }
  if (p.paid) return { cobrar: false, motivo: "ya-cobrado", detalle: `El pedido #${p.code} ya estaba cobrado.` };
  if (Math.abs(round2(input.monto) - round2(p.total)) > 0.009) {
    return {
      cobrar: false,
      motivo: "monto-distinto",
      detalle:
        `Mercado Pago avisó un pago de ${fmtMoneyARS(input.monto)} por el pedido #${p.code}, que ahora es de ` +
        `${fmtMoneyARS(p.total)}. No se cobró solo: revisalo y cobralo desde la bandeja.`,
    };
  }
  return { cobrar: true };
}

/** Lo que el cobro por aviso usa de afuera: inyectable para que el test lo EJECUTE sin base. */
export type DepsAvisoDePedido = {
  leerPedido: (tenantId: string, orderId: string) => Promise<{ code: number; total: number; paid: boolean; status: string } | null>;
  cerradoHasta: (tenantId: string) => Promise<string | null>;
  hoy: () => string;
  cobrar: (tenantId: string, args: { orderId: string; method: OrderPaymentMethod; actor: string }) => Promise<CobroDePedido>;
  auditar: (entry: { actor: string; action: string; entity: string; entityId: string; changes: unknown }) => Promise<void>;
};

const DEPS_AVISO: DepsAvisoDePedido = {
  leerPedido: (tenantId, orderId) =>
    prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { code: true, total: true, paid: true, status: true } }),
  cerradoHasta: (tenantId) => lastClosedDay(tenantId),
  hoy: () => dateStrInBusinessTz(new Date()),
  cobrar: (tenantId, args) => tenantTransaction((tx) => cobrarPedidoEnTx(tx, tenantId, args), { tenantId }),
  auditar: (entry) => audit(entry),
};

/**
 * El aviso de pago de Mercado Pago cobra el pedido del link: MISMO cobro que el botón
 * «Cobrar» (`cobrarPedidoEnTx`), con Mercado Pago como medio y el pago como firma. Idempotente:
 * el mismo aviso repetido encuentra el pedido cobrado y no escribe un segundo asiento.
 *
 * Respeta la frontera del día cerrado, como todo cobro: si la caja de hoy ya se cerró, el
 * pedido queda a cobrar (la bandeja lo muestra) y el aviso lo dice. Nunca tira por una regla de
 * negocio: devuelve el motivo. Un error de base sí sube, para que Mercado Pago reintente.
 *
 * QUIÉN LA LLAMA HOY: el simulador de avisos (cobros-actions.ts, sólo en modo de prueba). El
 * webhook de producción todavía no (src/lib/mercadopago-dispatch.ts no le pasa `cobrarPedido`
 * al handler, y la ruta descarta los avisos con la facturación apagada): conectarlo es una
 * decisión del dueño, porque abre el endpoint público al cobro de pedidos.
 */
export async function cobrarPedidoPorAvisoDePago(
  aviso: AvisoDePagoDePedido,
  deps: DepsAvisoDePedido = DEPS_AVISO,
): Promise<ResultadoAvisoDePedido> {
  const pedido = await deps.leerPedido(aviso.tenantId, aviso.orderId);
  const d = decidirCobroPorAviso({ pedido, monto: aviso.monto });
  if (!d.cobrar) return { cobrado: false, motivo: d.motivo, detalle: d.detalle, ...(pedido ? { code: pedido.code } : {}) };

  const frontera = fronteraDeVenta({
    paid: true,
    paymentMethod: "MERCADOPAGO",
    hoy: deps.hoy(),
    cerradoHasta: await deps.cerradoHasta(aviso.tenantId),
    esDiaCerrado: isFrozenDay,
    contexto: "cobro",
  });
  if (frontera.bloquea) return { cobrado: false, motivo: "dia-cerrado", detalle: frontera.error, code: pedido!.code };

  const actor = `mercadopago:${aviso.paymentId}`;
  let cobro: CobroDePedido;
  try {
    cobro = await deps.cobrar(aviso.tenantId, { orderId: aviso.orderId, method: "MERCADOPAGO", actor });
  } catch (e) {
    if (e instanceof CobroDePedidoAnulado) {
      return { cobrado: false, motivo: "anulado", detalle: e.message, code: pedido!.code };
    }
    // Dos avisos simultáneos del mismo pago: el segundo choca el único asiento VENTA del pedido.
    if (isUniqueViolation(e, "orderId")) {
      return { cobrado: false, motivo: "ya-cobrado", detalle: `El pedido #${pedido!.code} ya estaba cobrado.`, code: pedido!.code };
    }
    throw e;
  }
  if (cobro.tipo === "no-existe") return { cobrado: false, motivo: "no-existe", detalle: "El pedido ya no existe." };
  if (cobro.tipo === "ya-cobrado") {
    return { cobrado: false, motivo: "ya-cobrado", detalle: `El pedido #${cobro.code} ya estaba cobrado.`, code: cobro.code };
  }
  await deps.auditar({
    actor,
    action: "update",
    entity: "Order",
    entityId: cobro.order.id,
    changes: { paid: true, method: "MERCADOPAGO", code: cobro.order.code, pagoMercadoPago: aviso.paymentId },
  });
  return { cobrado: true, code: cobro.order.code, total: cobro.order.total };
}

// ── Anular una venta a cuenta ────────────────────────────────────────────────

/** La venta a cuenta no se puede anular así (ya tiene cobros, o es de otro día). */
export class AnulacionDeCuentaRechazada extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "AnulacionDeCuentaRechazada";
  }
}

/**
 * La deuda de una venta a cuenta, al anular la venta, DENTRO de la misma transacción: si la
 * venta se anula, su deuda también (queda VOID), y si la deuda no se puede anular, la venta
 * tampoco. Sin esto, anular una venta a cuenta dejaba al cliente debiendo una venta que el
 * sistema da por inexistente.
 *
 *   · Una deuda que ya tiene cobros no se anula acá: esa plata ya entró al libro por la cuenta
 *     corriente y la corrección va por Cuentas a cobrar.
 *   · Quien anula sólo lo de hoy (recepción) no anula una venta a cuenta de otro día: la venta
 *     a cuenta no tiene asiento en el libro, así que el límite de día del libro no la frenaba.
 *
 * Lo llama la anulación SÓLO con cuentas corrientes encendidas: apagadas no hay deudas nacidas
 * de una venta, y la tabla puede no estar en la base (lote de 5).
 */
export async function anularCuentaDeLaVentaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orderId: string,
  opts: { soloDelDia: string | null; diaDe: (d: Date) => string },
): Promise<{ anulada: boolean; monto: number }> {
  const deuda = await tx.accountReceivable.findFirst({
    where: { tenantId, orderId, status: "OPEN" },
    select: { id: true, amount: true, issueDate: true },
  });
  if (!deuda) return { anulada: false, monto: 0 };
  if (opts.soloDelDia && opts.diaDe(deuda.issueDate) !== opts.soloDelDia) {
    throw new AnulacionDeCuentaRechazada(
      "Esa venta a cuenta es de otro día y con tu usuario sólo se anulan las ventas de hoy. Pedile al dueño del negocio que la anule.",
    );
  }
  const cobros = await tx.collection.count({ where: { tenantId, originType: "RECEIVABLE", originId: deuda.id } });
  if (cobros > 0) {
    throw new AnulacionDeCuentaRechazada(
      "Esa venta a cuenta ya tiene cobros en la cuenta corriente del cliente: no se anula desde acá. " +
        "Corregila desde Cuentas a cobrar.",
    );
  }
  await tx.accountReceivable.updateMany({ where: { id: deuda.id, tenantId, status: "OPEN" }, data: { status: "VOID" } });
  return { anulada: true, monto: round2(Number(deuda.amount)) };
}

/**
 * El cuerpo de la transacción de «Anular venta» (`anularVentaCore`, order-actions.ts): la venta
 * (`anularVentaInTx`: estado, contrapartida en el libro, stock) y, con cuentas corrientes
 * encendidas, la deuda de una venta A CUENTA (`anularCuentaDeLaVentaEnTx`). Las dos patas en la
 * MISMA transacción: si la deuda no se puede anular (ya tiene cobros, o es de otro día y quien
 * anula sólo puede lo de hoy), `AnulacionDeCuentaRechazada` sale de acá y la transacción vuelve
 * atrás entera: la venta no queda anulada con su deuda abierta.
 *
 * Vive acá, fuera del "use server", para que un test la ejecute con una base falsa.
 */
export async function anularVentaConSuCuentaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  args: AnularVentaArgs,
  opts: { conCuentas: boolean },
): Promise<{ venta: AnularVentaResult; cuenta: { anulada: boolean; monto: number } }> {
  const venta = await anularVentaInTx(tx, tenantId, args);
  if (!venta.applied || !opts.conCuentas) return { venta, cuenta: { anulada: false, monto: 0 } };
  const cuenta = await anularCuentaDeLaVentaEnTx(tx, tenantId, args.orderId, {
    soloDelDia: args.soloDelDia ?? null,
    diaDe: args.diaDe,
  });
  return { venta, cuenta };
}
