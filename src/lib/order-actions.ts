"use server";

// Capability POS / Orden (ADR-003 "Orden/Venta", Fase 2 POS).
// Capability del CORE — sirve a cualquier vertical retail; la carnicería `magra`
// la usa para vender cortes por kg (venta por peso) y tomar pedidos de vidriera.
// Aislamiento multi-tenant: cada write escribe `tenantId` (getCurrentTenantId,
// fail-closed ADR-015) y cada read filtra por él, igual que el resto del Core.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import type { $Enums } from "@/generated/prisma/client";

type OrderStatus = $Enums.OrderStatus;

const ORDERS_PATH = "/admin/pedidos";

// Flujo de estados de un pedido. El mostrador lo empuja hacia adelante; no hay
// vuelta atrás (una cancelación es un estado terminal aparte). READY = listo para
// que el cliente retire o para despachar.
const STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

// Redondeo a 2 decimales (pesos). La venta por kg da importes con fracción
// (0.750 kg × $8900/kg): se snapshotea el total ya redondeado en la línea.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Precio de venta vigente de un producto según cómo se vende. WEIGHT → precio/kg;
// UNIT → precio unitario. Devuelve null si el producto no tiene precio cargado
// (no se puede vender suelto todavía) para que la acción lo descarte.
function sellPrice(p: { saleUnit: string; price: number | null; pricePerKg: number | null }): number | null {
  return p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
}

// --- Loader de la pantalla POS / bandeja de pedidos ---

export async function getPosData() {
  await requireCapability("orders:read");
  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true },
    }),
    // Solo productos vendibles: activos, no borrados, con algún precio cargado.
    prisma.product.findMany({
      where: {
        deletedAt: null,
        active: true,
        OR: [{ price: { not: null } }, { pricePerKg: { not: null } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true },
    }),
  ]);
  return { orders, products };
}

// --- Crear pedido / venta de mostrador (el "checkout") ---
//
// Una sola acción cubre los dos caminos del MVP: venta de mostrador (channel
// COUNTER, se cobra en el acto → nace CONFIRMED) y toma de pedido con retiro/
// delivery (channel ONLINE → nace PENDING a la espera de confirmación). La misma
// acción la reusará la vidriera pública cuando exista.
export async function createOrder(formData: FormData) {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();

  const channel = String(formData.get("channel") || "COUNTER") === "ONLINE" ? "ONLINE" : "COUNTER";
  const fulfillment =
    String(formData.get("fulfillment") || "PICKUP") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const customerName = String(formData.get("customerName") || "").trim() || "Mostrador";
  const customerPhone = String(formData.get("customerPhone") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const scheduledRaw = String(formData.get("scheduledFor") || "").trim();
  const paid = String(formData.get("paid")) === "on" || String(formData.get("paid")) === "true";
  const paymentMethodRaw = String(formData.get("paymentMethod") || "").trim();
  const paymentMethod =
    paymentMethodRaw === "MERCADOPAGO" || paymentMethodRaw === "EFECTIVO" || paymentMethodRaw === "TRANSFERENCIA"
      ? paymentMethodRaw
      : null;

  if (fulfillment === "DELIVERY" && !address) {
    throw new Error("Para envío a domicilio hace falta la dirección.");
  }

  // Líneas: arrays paralelos productId[] / quantity[] (mismo patrón que el resto
  // del Core — formData.getAll). quantity son unidades (UNIT) o kilos (WEIGHT).
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map((q) => Number(q));

  const wanted = productIds
    .map((id, i) => ({ id, qty: quantities[i] }))
    .filter((l) => l.id && Number.isFinite(l.qty) && l.qty > 0);

  if (wanted.length === 0) {
    throw new Error("Agregá al menos un producto con cantidad al pedido.");
  }

  // Snapshot de precio/nombre al momento de la venta (ADR-009 §4): se trae el
  // producto real y se congela lo cobrado, no se confía en lo que mandó el form.
  const products = await prisma.product.findMany({
    where: { id: { in: wanted.map((l) => l.id) }, tenantId, deletedAt: null },
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = wanted
    .map((l) => {
      const p = byId.get(l.id);
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
  const status = channel === "ONLINE" ? "PENDING" : "CONFIRMED";
  // scheduledFor es una preferencia blanda (horario de retiro/entrega); para el
  // MVP se interpreta en hora local del server. Provisional: unificar con la TZ
  // del tenant (AMD-004) cuando la vidriera pública lo use en serio.
  const scheduledFor = scheduledRaw ? new Date(scheduledRaw) : null;

  const order = await prisma.$transaction(async (tx) => {
    // Correlativo legible por tenant: max(code)+1. Suficiente para el volumen del
    // MVP; el @@unique([tenantId, code]) protege contra choques (una colisión
    // rarísima lanzaría y se reintenta el alta). Una secuencia por tenant es
    // trabajo futuro si el volumen lo pide.
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
        channel,
        fulfillment,
        customerName,
        customerPhone,
        address: address || null,
        notes: notes || null,
        scheduledFor,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: paid ? paymentMethod : null,
        paid: paid && paymentMethod != null,
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

  await auditAdmin({
    action: "create",
    entity: "Order",
    entityId: order.id,
    changes: { code: order.code, channel, fulfillment, total: subtotal, lines: lines.length },
  });
  revalidatePath(ORDERS_PATH);
}

// --- Avanzar estado del pedido ---

export async function advanceOrderStatus(formData: FormData) {
  await requireCapability("orders:manage");
  const id = String(formData.get("id"));
  const current = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!current) return;
  const next = STATUS_FLOW[current.status];
  if (!next) return; // terminal (DELIVERED / CANCELLED): no avanza
  await prisma.order.update({ where: { id }, data: { status: next } });
  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: id,
    changes: { status: { from: current.status, to: next } },
  });
  revalidatePath(ORDERS_PATH);
}

// --- Marcar cobrado ---

export async function setOrderPaid(formData: FormData) {
  await requireCapability("orders:manage");
  const id = String(formData.get("id"));
  const methodRaw = String(formData.get("paymentMethod") || "EFECTIVO").trim();
  const method =
    methodRaw === "MERCADOPAGO" || methodRaw === "TRANSFERENCIA" ? methodRaw : "EFECTIVO";
  await prisma.order.update({ where: { id }, data: { paid: true, paymentMethod: method } });
  await auditAdmin({ action: "update", entity: "Order", entityId: id, changes: { paid: true, method } });
  revalidatePath(ORDERS_PATH);
}

// --- Cancelar ---

export async function cancelOrder(formData: FormData) {
  await requireCapability("orders:manage");
  const id = String(formData.get("id"));
  const current = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!current || current.status === "DELIVERED" || current.status === "CANCELLED") return;
  await prisma.order.update({ where: { id }, data: { status: "CANCELLED" } });
  await auditAdmin({ action: "update", entity: "Order", entityId: id, changes: { status: "CANCELLED" } });
  revalidatePath(ORDERS_PATH);
}
