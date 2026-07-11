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
import { insertOrder, type OrderPaymentMethod } from "@/lib/order-core";
import { recordCashSaleMovementInTx } from "@/lib/caja/cash-sale";
import { tenantTransaction } from "@/lib/rls";
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

// --- Creación de orden: el Core compartido vive en `order-core.ts` ---
//
// `insertOrder` (importado arriba) es el único lugar donde se arma una orden: lo
// reusan el POS del backoffice (`createOrder`, con auth), la vidriera pública
// (`placeOnlineOrder`, sin auth) y la API de ingesta externa (ADR-020 §II). Acá
// solo quedan los adaptadores de FormData → OrderInput de las Server Actions.

type PaymentMethod = OrderPaymentMethod;

// Parsea las líneas (arrays paralelos productId[]/quantity[], patrón getAll del
// Core) de un FormData a la forma que espera insertOrder.
function parseItems(formData: FormData): { productId: string; qty: number }[] {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map((q) => Number(q));
  return productIds.map((id, i) => ({ productId: id, qty: quantities[i] }));
}

// I7 (ADR-064): la imputación de la venta en efectivo a la caja YA NO es una segunda tx
// best-effort. Ahora va ATÓMICA con la venta, dentro de la MISMA transacción:
//  - al CREAR la venta ya cobrada → `insertOrder(..., { imputarCajaActor })` (order+stock+caja
//    todo-o-nada);
//  - al marcar cobrado DESPUÉS (`setOrderPaid`) → update del pedido + asiento de caja en una
//    sola `tenantTransaction`.
// Un fallo real de DB en el asiento aborta toda la operación (la venta no queda cobrada sin su
// movimiento de caja → el arqueo nunca descuadra). Las condiciones benignas (no efectivo / sin
// caja abierta / ya imputada) vuelven como { recorded:false } sin abortar: la venta se concreta.

// --- Crear pedido / venta de mostrador (el "checkout" del backoffice) ---
//
// Cubre los dos caminos operados por el mostrador: venta presencial (channel
// COUNTER, se cobra en el acto → CONFIRMED) y toma de pedido con retiro/delivery
// (channel ONLINE → PENDING). Requiere capability de mostrador.
export async function createOrder(formData: FormData) {
  const user = await requireCapability("orders:manage");
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

  // I7 (ADR-064): la imputación a caja de la venta en efectivo va ATÓMICA con la orden+stock
  // dentro de `insertOrder` (una sola tx, todo-o-nada). `imputarCajaActor` la activa: solo el
  // mostrador imputa caja física. Un fallo de DB al asentar la caja aborta toda la venta (no
  // queda cobrada sin su movimiento → el arqueo nunca descuadra).
  const result = await insertOrder(
    tenantId,
    {
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
    },
    { imputarCajaActor: `user:${user.id}` },
  );

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
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id"));
  const methodRaw = String(formData.get("paymentMethod") || "EFECTIVO").trim();
  const method: PaymentMethod =
    methodRaw === "MERCADOPAGO" || methodRaw === "TRANSFERENCIA" ? methodRaw : "EFECTIVO";

  // I7 (ADR-064): marcar cobrado + asentar la caja son ATÓMICOS (una sola tx). Antes el update
  // y la imputación corrían en tx separadas → un fallo de caja dejaba el pedido cobrado sin su
  // movimiento (arqueo descuadrado). Ahora, si el asiento de caja falla por un error de DB, el
  // "cobrado" también se revierte. El asiento es idempotente por orderId (no duplica si ya se
  // imputó al crear la venta) y benigno si no hay caja abierta / no es efectivo (recorded:false).
  const order = await tenantTransaction(
    async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { paid: true, paymentMethod: method },
        select: { id: true, code: true, total: true },
      });
      await recordCashSaleMovementInTx(tx, tenantId, {
        orderId: updated.id,
        orderCode: updated.code,
        paid: true,
        paymentMethod: method,
        total: updated.total,
        actor: `user:${user.id}`,
      });
      return updated;
    },
    { tenantId },
  );

  await auditAdmin({ action: "update", entity: "Order", entityId: order.id, changes: { paid: true, method } });

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
    slug: tenant?.slug ?? null,
    branding: settings ?? null,
    wording,
    copy,
    products,
  };
}
