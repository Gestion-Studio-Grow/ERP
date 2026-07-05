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
};

// Redondeo a 2 decimales (pesos). La venta por kg da importes con fracción
// (0.750 kg × $8900/kg): se snapshotea el total ya redondeado en la línea.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

// Valida, snapshotea precios y crea la orden + sus líneas en una transacción.
// Snapshot de precio/nombre al momento de la venta (ADR-009 §4): trae el producto
// real del tenant y congela lo cobrado, no confía en el input.
export async function insertOrder(
  tenantId: string,
  input: OrderInput,
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
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = wanted
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
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) {
    throw new Error("Ninguno de los productos elegidos tiene precio de venta cargado.");
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const status = input.channel === "ONLINE" ? "PENDING" : "CONFIRMED";

  const order = await prisma.$transaction(async (tx) => {
    // Correlativo legible por tenant: max(code)+1. Suficiente para el volumen del
    // MVP; el @@unique([tenantId, code]) protege contra choques (una colisión
    // rarísima lanzaría y se reintenta el alta). Secuencia por tenant = futuro.
    const last = await tx.order.findFirst({
      where: { tenantId },
      orderBy: { code: "desc" },
      select: { code: true },
    });
    const code = (last?.code ?? 0) + 1;

    return tx.order.create({
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
  });

  return { id: order.id, code: order.code, subtotal, lines: lines.length };
}
