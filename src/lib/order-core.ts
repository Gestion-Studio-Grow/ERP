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
import {
  aplicarDescuento,
  type LineaAMano,
  type PedidoDeDescuento,
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
};

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
export type InsertOrderOpts = {
  imputarCajaActor?: string;
  idempotencyKey?: string | null;
  permitirNegativoPorProducto?: readonly string[];
  descuento?: { pedido: PedidoDeDescuento; topePct: number | null } | null;
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
 */
export function decidirAlta(p: {
  tenantId: string;
  input: OrderInput;
  products: OrderProduct[];
  opts?: Pick<InsertOrderOpts, "descuento" | "imputarCajaActor">;
}): AltaDecidida {
  const lines = buildOrderLines(p.products, pedidasValidas(p.input.items));
  const aMano = p.input.lineasAMano ?? [];
  if (lines.length === 0 && aMano.length === 0) {
    throw new Error("Ninguno de los productos elegidos tiene precio de venta cargado.");
  }
  // Subtotal: las líneas con producto (precio de la base) más las de precio a mano.
  const subtotal = round2(orderSubtotal(lines) + aMano.reduce((s, l) => s + l.importe, 0));
  const desc = aplicarDescuento({
    subtotal,
    pedido: p.opts?.descuento?.pedido ?? null,
    topePct: p.opts?.descuento?.topePct ?? null,
  });
  if (!desc.ok) throw new Error(desc.error);
  return {
    tenantId: p.tenantId,
    status: p.input.channel === "ONLINE" ? "PENDING" : "CONFIRMED",
    input: p.input,
    subtotal,
    descuento: desc.descuento,
    total: desc.total,
    lines,
    aMano,
    imputarCajaActor: p.opts?.imputarCajaActor,
  };
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
  // Líneas, subtotal, descuento (con el tope de quien vende) y total: `decidirAlta`.
  const alta = decidirAlta({ tenantId, input, products, opts });

  const negativoPermitido = new Set(opts?.permitirNegativoPorProducto ?? []);
  const clientId = await clienteDelTelefono(tenantId, input.customerPhone);

  // Toda la orquestación de guardas (A-1 idempotencia + A-2 colisión de correlativo + tolerancia
  // schema-ahead) vive en `insertOrderGuarded`, con las operaciones de DB INYECTADAS para poder
  // testearla sin DB (ADR-026). Acá solo se arma el `runInsert` real: la tx que crea la orden,
  // descuenta stock e imputa caja (todo-o-nada, I7): la orden la arma `crearOrdenEnTx`, el stock
  // se descuenta acá mismo y el libro lo asienta `imputarVentaEnTx`.
  const r = await insertOrderGuarded({
    idempotencyKey: opts?.idempotencyKey?.trim() || null,
    subtotal: alta.subtotal,
    total: alta.total,
    lineCount: alta.lines.length + alta.aMano.length,
    findByKey: (key) => findOrderByIdempotencyKey(tenantId, key),
    runInsert: (writeKey) =>
      tenantTransaction(async (tx) => {
        const datos: DatosDelAlta = { ...alta, clientId, writeKey };
        const created = await crearOrdenEnTx(tx, datos);

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

        const cashSale = await imputarVentaEnTx(tx, datos, created);
        return { id: created.id, code: created.code, cashSale };
      }, { tenantId }),
  });
  if (r.dedup) return r;
  return { ...r, descuento: alta.descuento, clientId };
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
      paymentMethod: input.paid ? input.paymentMethod : null,
      paid: input.paid && input.paymentMethod != null,
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
  runInsert: (writeKey: string | null) => Promise<{ id: string; code: number; cashSale?: RecordCashSaleResult }>;
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
      return { id: created.id, code: created.code, subtotal, total, lines: lineCount, cashSale: created.cashSale };
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
