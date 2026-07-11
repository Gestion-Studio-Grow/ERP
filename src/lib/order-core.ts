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
import type { ProductSaleUnit } from "@/generated/prisma/client";

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
};

export type InsertedOrder = {
  id: string;
  code: number;
  subtotal: number;
  lines: number;
  // I7 (ADR-064): resultado de la imputación a caja, presente solo si el llamador pidió
  // imputar (venta de mostrador en efectivo). El asiento se hizo DENTRO de la misma tx que
  // la orden+stock → atómico. `recorded:false` es una condición benigna (no efectivo / sin
  // caja abierta / ya imputada), NO un fallo: un fallo de DB habría abortado toda la venta.
  cashSale?: RecordCashSaleResult;
};

// Opciones de `insertOrder`. `imputarCajaActor` activa el asiento de caja ATÓMICO con la
// venta (I7): solo lo pasa el mostrador (venta presencial); la vidriera y la API externa no
// tocan la caja física, así que lo omiten y la orden se crea sin imputar.
export type InsertOrderOpts = { imputarCajaActor?: string };

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
export function stockDecrementLines(lines: OrderLine[]): OrderLine[] {
  return lines.filter((l) => l.trackStock);
}

// Regla anti-oversell: ¿alcanza el stock disponible para vender `quantity`?
// Espeja EXACTAMENTE la guarda atómica del WHERE (`stock: { gte: quantity }`):
// solo se puede descontar si el disponible es >= la cantidad pedida. Nunca deja
// stock negativo ni permite ventas parciales. Vender 0/negativo no consume stock.
export function canDecrementStock(available: number, quantity: number): boolean {
  return quantity > 0 && available >= quantity;
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

  const wanted = input.items.filter(
    (l) => l.productId && Number.isFinite(l.qty) && l.qty > 0,
  );
  if (wanted.length === 0) {
    throw new Error("Agregá al menos un producto con cantidad al pedido.");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: wanted.map((l) => l.productId) }, tenantId, deletedAt: null, active: true },
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, trackStock: true },
  });
  const lines = buildOrderLines(products, wanted);

  if (lines.length === 0) {
    throw new Error("Ninguno de los productos elegidos tiene precio de venta cargado.");
  }

  const subtotal = orderSubtotal(lines);
  const status = input.channel === "ONLINE" ? "PENDING" : "CONFIRMED";

  const order = await tenantTransaction(async (tx) => {
    // Correlativo legible por tenant: max(code)+1. Suficiente para el volumen del
    // MVP; el @@unique([tenantId, code]) protege contra choques (una colisión
    // rarísima lanzaría y se reintenta el alta). Secuencia por tenant = futuro.
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
        status,
        channel: input.channel,
        fulfillment: input.fulfillment,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        address: input.address,
        notes: input.notes,
        scheduledFor: input.scheduledFor,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: input.paid ? input.paymentMethod : null,
        paid: input.paid && input.paymentMethod != null,
        items: {
          create: lines.map((l) => ({
            tenantId,
            productId: l.productId,
            name: l.name,
            saleUnit: l.saleUnit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        },
      },
      select: { id: true, code: true },
    });

    // Descuento de stock al vender (POS/stock), SOLO para productos con `trackStock`.
    // Pasa por el ledger (`recordMovement`): baja condicional atómica con la MISMA
    // guarda anti-oversell (si el stock ya no alcanza porque otra venta se adelantó,
    // afecta 0 filas y lanza, abortando toda la orden — nada de ventas parciales ni
    // stock negativo) Y registra el StockMovement (VENTA) en la misma transacción.
    // Corre DENTRO de la tx de la orden: o se vende, se descuenta y se asienta, o nada.
    for (const l of stockDecrementLines(lines)) {
      await recordMovement(tx, {
        tenantId,
        productId: l.productId,
        type: "VENTA",
        qty: l.quantity,
        orderId: created.id,
        createdBy: "system",
        label: l.name,
      });
    }

    // I7 (ADR-064): FRONTERA ATÓMICA de la venta al contado. Si el mostrador cobró en
    // efectivo, el asiento de caja va en ESTA MISMA tx (no en una segunda tx best-effort):
    // o se crea la orden, se descuenta el stock y se asienta la caja, o NADA. Así el arqueo
    // nunca queda con la venta cobrada pero sin su movimiento (ni al revés). El helper
    // self-gatea (no efectivo / total<=0 → recorded:false, benigno) y NO lanza salvo por un
    // error real de DB, que aborta toda la venta (la atomicidad que pide I7).
    let cashSale: RecordCashSaleResult | undefined;
    if (opts?.imputarCajaActor) {
      cashSale = await recordCashSaleMovementInTx(tx, tenantId, {
        orderId: created.id,
        orderCode: created.code,
        paid: input.paid && input.paymentMethod != null,
        paymentMethod: input.paid ? input.paymentMethod : null,
        total: subtotal, // subtotal == total: insertOrder no aplica descuento todavía.
        actor: opts.imputarCajaActor,
      });
    }

    return { ...created, cashSale };
  }, { tenantId });

  return { id: order.id, code: order.code, subtotal, lines: lines.length, cashSale: order.cashSale };
}
