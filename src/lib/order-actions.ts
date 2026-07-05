"use server";

// Capability POS / Orden (ADR-003 "Orden/Venta", Fase 2 POS).
// Capability del CORE — sirve a cualquier vertical retail; la carnicería `magra`
// la usa para vender cortes por kg (venta por peso) y tomar pedidos de vidriera.
// Aislamiento multi-tenant: cada write escribe `tenantId` (getCurrentTenantId,
// fail-closed ADR-015) y cada read filtra por él, igual que el resto del Core.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin, auditPublic } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { retailWordingForSlug } from "@/blueprints/retail";
import { getStorefrontCopy } from "@/tenants/storefront";
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

// --- Core de creación de orden (compartido por mostrador y vidriera) ---

type PaymentMethod = "MERCADOPAGO" | "EFECTIVO" | "TRANSFERENCIA";

type OrderInput = {
  channel: "COUNTER" | "ONLINE";
  fulfillment: "PICKUP" | "DELIVERY";
  customerName: string;
  customerPhone: string;
  address: string | null;
  notes: string | null;
  scheduledFor: Date | null;
  paid: boolean;
  paymentMethod: PaymentMethod | null;
  items: { productId: string; qty: number }[];
};

// Valida, snapshotea precios y crea la orden + sus líneas en una transacción.
// Es el único lugar donde se arma una orden: lo llaman tanto el POS del backoffice
// (`createOrder`, con auth) como la vidriera pública (`placeOnlineOrder`, sin auth).
// No audita ni revalida — de eso se ocupa cada acción llamadora según su contexto.
async function insertOrder(
  tenantId: string,
  input: OrderInput,
): Promise<{ id: string; code: number; subtotal: number; lines: number }> {
  if (input.fulfillment === "DELIVERY" && !input.address) {
    throw new Error("Para envío a domicilio hace falta la dirección.");
  }

  const wanted = input.items.filter((l) => l.productId && Number.isFinite(l.qty) && l.qty > 0);
  if (wanted.length === 0) {
    throw new Error("Agregá al menos un producto con cantidad al pedido.");
  }

  // Snapshot de precio/nombre al momento de la venta (ADR-009 §4): se trae el
  // producto real del tenant y se congela lo cobrado, no se confía en el form.
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

// Parsea las líneas (arrays paralelos productId[]/quantity[], patrón getAll del
// Core) de un FormData a la forma que espera insertOrder.
function parseItems(formData: FormData): { productId: string; qty: number }[] {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map((q) => Number(q));
  return productIds.map((id, i) => ({ productId: id, qty: quantities[i] }));
}

// --- Crear pedido / venta de mostrador (el "checkout" del backoffice) ---
//
// Cubre los dos caminos operados por el mostrador: venta presencial (channel
// COUNTER, se cobra en el acto → CONFIRMED) y toma de pedido con retiro/delivery
// (channel ONLINE → PENDING). Requiere capability de mostrador.
export async function createOrder(formData: FormData) {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();

  const channel = String(formData.get("channel") || "COUNTER") === "ONLINE" ? "ONLINE" : "COUNTER";
  const fulfillment =
    String(formData.get("fulfillment") || "PICKUP") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const scheduledRaw = String(formData.get("scheduledFor") || "").trim();
  const paid = String(formData.get("paid")) === "on" || String(formData.get("paid")) === "true";
  const paymentMethodRaw = String(formData.get("paymentMethod") || "").trim();
  const paymentMethod: PaymentMethod | null =
    paymentMethodRaw === "MERCADOPAGO" || paymentMethodRaw === "EFECTIVO" || paymentMethodRaw === "TRANSFERENCIA"
      ? paymentMethodRaw
      : null;

  const result = await insertOrder(tenantId, {
    channel,
    fulfillment,
    customerName: String(formData.get("customerName") || "").trim() || "Mostrador",
    customerPhone: String(formData.get("customerPhone") || "").trim(),
    address: String(formData.get("address") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    // scheduledFor es una preferencia blanda (horario de retiro/entrega); MVP la
    // interpreta en hora local del server (provisional; unificar con TZ del tenant).
    scheduledFor: scheduledRaw ? new Date(scheduledRaw) : null,
    paid,
    paymentMethod,
    items: parseItems(formData),
  });

  await auditAdmin({
    action: "create",
    entity: "Order",
    entityId: result.id,
    changes: { code: result.code, channel, fulfillment, total: result.subtotal, lines: result.lines },
  });
  revalidatePath(ORDERS_PATH);
}

// --- Tomar pedido desde la vidriera pública (sin auth) ---
//
// La misma capability POS del Core, pero disparada por un cliente final en la
// vidriera: siempre ONLINE, siempre PENDING y SIN cobrar (el mostrador confirma y
// cobra al preparar). Escribe con el tenant actual (fail-closed ADR-015) y audita
// como acción pública. Al terminar redirige a la página de gracias con el nº.
export async function placeOnlineOrder(formData: FormData) {
  const tenantId = await getCurrentTenantId();

  const fulfillment =
    String(formData.get("fulfillment") || "PICKUP") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const customerName = String(formData.get("customerName") || "").trim();
  const customerPhone = String(formData.get("customerPhone") || "").trim();
  if (!customerName || !customerPhone) {
    throw new Error("Necesitamos tu nombre y un teléfono de contacto para tomar el pedido.");
  }

  const result = await insertOrder(tenantId, {
    channel: "ONLINE",
    fulfillment,
    customerName,
    customerPhone,
    address: String(formData.get("address") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    scheduledFor: null,
    paid: false,
    paymentMethod: null,
    items: parseItems(formData),
  });

  await auditPublic({
    action: "create",
    entity: "Order",
    entityId: result.id,
    clientPhone: customerPhone,
    changes: { code: result.code, channel: "ONLINE", fulfillment, total: result.subtotal },
  });
  // El backoffice ve el pedido nuevo en su bandeja al revalidar.
  revalidatePath(ORDERS_PATH);
  redirect(`/tienda/gracias?pedido=${result.code}`);
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

// --- Loader público de la vidriera (sin auth) ---
//
// Lo consume la vidriera pública por tenant (`/tienda`). Devuelve el nombre del
// negocio, su branding (BusinessSettings), el **wording del rubro** (para que la
// vidriera se sienta hecha para ese negocio) y el catálogo vendible del tenant
// actual. Sin capability: es una página pública. El aislamiento lo da
// getCurrentTenantId (fail-closed) + el filtro por tenantId en cada query.
export async function getStorefront() {
  const tenantId = await getCurrentTenantId();
  const [tenant, settings, products] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    prisma.businessSettings.findUnique({
      where: { tenantId },
      select: {
        shortLabel: true,
        city: true,
        addressLine: true,
        hoursLabel: true,
        whatsapp: true,
        instagram: true,
        email: true,
        contactNote: true,
      },
    }),
    prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        active: true,
        OR: [{ price: { not: null } }, { pricePerKg: { not: null } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true },
    }),
  ]);
  // Wording GENÉRICO del rubro (blueprint retail) + copy PROPIO del tenant (voz firma),
  // ambos resueltos por slug. `copy` es null para tenants sin copy → cae al wording.
  const wording = retailWordingForSlug(tenant?.slug);
  const copy = getStorefrontCopy(tenant?.slug);
  return {
    name: tenant?.name ?? "Tienda",
    branding: settings ?? null,
    wording,
    copy,
    products,
  };
}
