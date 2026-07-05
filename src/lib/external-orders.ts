/**
 * Comando Core de ingesta de pedidos externos (superficie II de ADR-020).
 *
 * Es "el mismo comando de orden, proyectado sobre el borde de un consumidor
 * externo" (ADR-020 §3): un front que NO es el nuestro (el WordPress/WooCommerce
 * del estudio del cliente) crea un pedido en el backoffice de un tenant. Reusa
 * `insertOrder` (order-core) — no reimplementa la creación — y encima dispara el
 * flujo que la unidad "backoffice-only" promete:
 *   1. el pedido cae en la bandeja `/admin/pedidos` (channel ONLINE → PENDING),
 *   2. se descuenta stock de los productos vendidos (best-effort),
 *   3. se factura vía ARCA/MP si la facturación está habilitada (best-effort,
 *      detrás de `isInvoicingEnabled()` — OFF en prod por default, inerte).
 *
 * Autenticación y resolución de tenant NO viven acá: las hace `public-api-auth`
 * (api-key + tenant fail-closed) antes de llamar a este comando con el tenantId
 * ya resuelto.
 */

import { prisma } from "@/lib/prisma";
import { insertOrder, type OrderPaymentMethod } from "@/lib/order-core";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { facturarOrden } from "@/lib/invoice-from-order";
import { ApiError } from "@/lib/public-api-auth";

/** Una línea del pedido tal como la manda el front externo. */
export type ExternalOrderItem = {
  /** Id interno del producto (si el estudio mapeó el catálogo). */
  productId?: string;
  /** Referencia alternativa: hoy se matchea contra el NOMBRE del producto
   *  (case-insensitive). Provisional — no hay columna SKU en Product todavía. */
  sku?: string;
  /** Nombre del producto (fallback de matcheo, equivalente a `sku`). */
  name?: string;
  /** Unidades (UNIT) o kilos (WEIGHT). */
  quantity: number;
};

/** El pedido completo que acepta la API. */
export type ExternalOrderInput = {
  tenant?: string;
  customer: { name: string; phone: string; address?: string | null; email?: string | null };
  fulfillment?: "PICKUP" | "DELIVERY";
  items: ExternalOrderItem[];
  payment?: { paid?: boolean; method?: OrderPaymentMethod | null };
  notes?: string | null;
  /** Horario de retiro/entrega deseado (ISO 8601). */
  scheduledFor?: string | null;
  /** Referencia del pedido en el sistema externo (queda en las notas). */
  externalRef?: string | null;
  /** Disparar facturación (default true; el flag maestro sigue mandando). */
  invoice?: boolean;
};

export type ExternalOrderResult = {
  id: string;
  code: number;
  status: "PENDING";
  total: number;
  currency: "ARS";
  invoiced: boolean;
};

const VALID_METHODS: OrderPaymentMethod[] = ["MERCADOPAGO", "EFECTIVO", "TRANSFERENCIA"];

/**
 * Valida y normaliza el body JSON crudo de la request a `ExternalOrderInput`.
 * Lanza `ApiError(400)` con mensaje claro ante cualquier forma inválida — el
 * borde externo es no confiable, así que se valida estricto acá (no en el Core).
 */
export function parseExternalOrder(raw: unknown): ExternalOrderInput {
  if (typeof raw !== "object" || raw === null) {
    throw new ApiError(400, "invalid_body", "El body debe ser un objeto JSON.");
  }
  const b = raw as Record<string, unknown>;

  const customer = b.customer as Record<string, unknown> | undefined;
  const name = typeof customer?.name === "string" ? customer.name.trim() : "";
  const phone = typeof customer?.phone === "string" ? customer.phone.trim() : "";
  if (!name || !phone) {
    throw new ApiError(400, "invalid_customer", "customer.name y customer.phone son obligatorios.");
  }

  if (!Array.isArray(b.items) || b.items.length === 0) {
    throw new ApiError(400, "invalid_items", "Se requiere al menos un item en `items`.");
  }
  const items: ExternalOrderItem[] = b.items.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const quantity = Number(o.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "invalid_item_qty", `items[${i}].quantity debe ser un número > 0.`);
    }
    const productId = typeof o.productId === "string" ? o.productId.trim() : undefined;
    const sku = typeof o.sku === "string" ? o.sku.trim() : undefined;
    const itemName = typeof o.name === "string" ? o.name.trim() : undefined;
    if (!productId && !sku && !itemName) {
      throw new ApiError(400, "invalid_item_ref", `items[${i}] necesita productId, sku o name.`);
    }
    return { productId, sku, name: itemName, quantity };
  });

  const fulfillment = b.fulfillment === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const payment = b.payment as Record<string, unknown> | undefined;
  const methodRaw = typeof payment?.method === "string" ? payment.method : null;
  const method = VALID_METHODS.includes(methodRaw as OrderPaymentMethod)
    ? (methodRaw as OrderPaymentMethod)
    : null;

  return {
    tenant: typeof b.tenant === "string" ? b.tenant : undefined,
    customer: {
      name,
      phone,
      address: typeof customer?.address === "string" ? customer.address.trim() || null : null,
      email: typeof customer?.email === "string" ? customer.email.trim() || null : null,
    },
    fulfillment,
    items,
    payment: { paid: payment?.paid === true, method },
    notes: typeof b.notes === "string" ? b.notes.trim() || null : null,
    scheduledFor: typeof b.scheduledFor === "string" ? b.scheduledFor : null,
    externalRef: typeof b.externalRef === "string" ? b.externalRef.trim() || null : null,
    invoice: b.invoice !== false,
  };
}

/**
 * Resuelve cada item externo a un `productId` interno del tenant. Match por
 * productId directo o, si no vino, por nombre exacto (case-insensitive) contra
 * `sku`/`name`. Si CUALQUIER item no resuelve, rechaza el pedido entero (422):
 * un pedido externo es una venta comprometida — no se acepta a medias.
 */
async function resolveItems(
  tenantId: string,
  items: ExternalOrderItem[],
): Promise<{ productId: string; qty: number }[]> {
  const products = await prisma.product.findMany({
    where: {
      tenantId,
      deletedAt: null,
      active: true,
      OR: [{ price: { not: null } }, { pricePerKg: { not: null } }],
    },
    select: { id: true, name: true },
  });
  const byId = new Set(products.map((p) => p.id));
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p.id]));

  const resolved: { productId: string; qty: number }[] = [];
  const unknown: string[] = [];

  for (const it of items) {
    let productId: string | undefined;
    if (it.productId && byId.has(it.productId)) {
      productId = it.productId;
    } else {
      const ref = (it.sku || it.name || it.productId || "").trim().toLowerCase();
      productId = ref ? byName.get(ref) : undefined;
    }
    if (productId) {
      resolved.push({ productId, qty: it.quantity });
    } else {
      unknown.push(it.productId || it.sku || it.name || "(item sin referencia)");
    }
  }

  if (unknown.length > 0) {
    throw new ApiError(
      422,
      "unknown_items",
      `No se pudieron mapear estos productos del tenant: ${unknown.join(", ")}.`,
    );
  }
  return resolved;
}

/**
 * Crea el pedido externo y dispara el flujo. El `tenantId` viene ya resuelto y
 * autenticado por `public-api-auth`.
 */
export async function createExternalOrder(
  tenantId: string,
  input: ExternalOrderInput,
): Promise<ExternalOrderResult> {
  const lines = await resolveItems(tenantId, input.items);

  // La referencia del sistema externo queda trazada en las notas del pedido
  // (provisional: no hay columna dedicada todavía; sirve de idempotencia manual).
  const notes = [input.externalRef ? `Ref externa: ${input.externalRef}` : null, input.notes]
    .filter(Boolean)
    .join(" · ") || null;

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;

  // `insertOrder` YA descuenta el stock de los productos con `trackStock` dentro de
  // su propia transacción, con la guarda atómica anti-oversell (order-core.ts, d48cc79).
  // El descuento adicional que vivía acá quedó obsoleto con ese commit: duplicaba la
  // baja de stock para los pedidos externos y, además, lo hacía sin la guarda `gte`
  // (podía dejar stock negativo) y sin filtro de `tenantId`. Se eliminó — la ingesta
  // externa hereda el mismo comportamiento de stock que el POS y la vidriera.
  const order = await insertOrder(tenantId, {
    channel: "ONLINE", // ingesta externa = canal online → cae PENDING en la bandeja
    fulfillment: input.fulfillment ?? "PICKUP",
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    address: input.customer.address ?? null,
    notes,
    scheduledFor: scheduledFor && !Number.isNaN(scheduledFor.getTime()) ? scheduledFor : null,
    paid: input.payment?.paid === true,
    paymentMethod: input.payment?.method ?? null,
    items: lines,
  });

  // Trigger del flujo secundario: facturación. Best-effort para no romper la toma
  // del pedido (ya persistido) si un paso secundario falla.
  let invoiced = false;
  if (input.invoice && isInvoicingEnabled()) {
    try {
      const invoiceId = await facturarOrden(order.id, tenantId);
      invoiced = invoiceId !== null;
    } catch (err) {
      console.error(`[external-orders] facturación best-effort falló para orden ${order.id}:`, err);
    }
  }

  return {
    id: order.id,
    code: order.code,
    status: "PENDING",
    total: order.subtotal,
    currency: "ARS",
    invoiced,
  };
}
