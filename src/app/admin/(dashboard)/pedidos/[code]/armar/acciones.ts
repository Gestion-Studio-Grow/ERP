"use server";

// ============================================================================
// ARMAR Y PESAR — las acciones de la pantalla (Magra, tanda 1 · 1C; magra-DISENO.md §2.2).
// ============================================================================
//
// Cada export de un archivo "use server" es un endpoint: los tres piden `orders:manage` y acotan
// todo por el `tenantId` de la sesión. Lo que escriben lo escriben las acciones de siempre
// (`updateOrderItems`, `advanceOrderStatus`, `registrarAvisoWhatsApp`, order-actions.ts), con sus
// reglas: precio del pedido, sólo sin cobrar, stock por la diferencia, la guarda del paso.
// Lo único nuevo es la fila `pedido-original` de AuditLog: lo que pidió la clienta, UNA vez, antes
// del primer ajuste, para medir el desvío contra lo pedido y no contra la última pesada.
//
// `audit()` nunca lanza (audit-core.ts): si la fila original no se pudo escribir, el ajuste sale
// igual y el desvío se mide contra lo que tenía el pedido (lo mismo que sin la fila).

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { advanceOrderStatus, registrarAvisoWhatsApp, updateOrderItems, type OrderActionState } from "@/lib/order-actions";
import { avisoPedidoListo } from "@/lib/order-anulacion";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { entregaDelRubro } from "@/blueprints/retail/rubros";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { formatearCantidad } from "@/lib/pos-peso";
import {
  ACCION_PEDIDO_ORIGINAL,
  TIPO_AVISO_DIFERENCIA,
  agregadoDelListo,
  avisoDelListo,
  leerPedidoOriginal,
  pedidoOriginalDe,
  type LineaDelPedido,
} from "./armar-core";

export type ResultadoDelListo = { ok: true; mensaje: string; wa: string } | { ok: false; error: string };

const SELECT_PEDIDO = {
  id: true,
  code: true,
  status: true,
  paid: true,
  subtotal: true,
  discount: true,
  total: true,
  customerName: true,
  customerPhone: true,
  fulfillment: true,
  address: true,
  items: {
    select: { productId: true, name: true, saleUnit: true, quantity: true, unitPrice: true, lineTotal: true },
    orderBy: { id: "asc" as const },
  },
} as const;

function lineas(items: readonly { productId: string | null; name: string; saleUnit: string; quantity: unknown; unitPrice: unknown; lineTotal: unknown }[]): LineaDelPedido[] {
  return items.map((it) => ({
    productId: it.productId,
    name: it.name,
    saleUnit: it.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    lineTotal: Number(it.lineTotal),
  }));
}

async function filaOriginal(tenantId: string, orderId: string) {
  return prisma.auditLog.findFirst({
    where: { tenantId, entity: "Order", action: ACCION_PEDIDO_ORIGINAL, entityId: orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { changes: true },
  });
}

/**
 * Guarda lo armado: deja escrito lo que pidió la clienta (si es el primer ajuste) y graba las
 * cantidades con `updateOrderItems` (la acción de «Pesar y ajustar», con todas sus reglas).
 * Mismos campos que esa acción: `id`, y `productId` + `quantity` por renglón.
 */
export async function guardarArmado(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido a armar." };
  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: SELECT_PEDIDO });
  if (!o) return { ok: false, error: "No se encontró el pedido. Volvé a la bandeja." };
  // Cobrado o cerrado no se toca (lo vuelve a decir `updateOrderItems`): no se escribe la fila.
  if (!o.paid && !(await filaOriginal(tenantId, id))) {
    await auditAdmin({
      action: ACCION_PEDIDO_ORIGINAL,
      entity: "Order",
      entityId: id,
      changes: {
        code: o.code,
        ...pedidoOriginalDe({ items: lineas(o.items), subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.total) }),
      },
    });
  }
  return updateOrderItems(null, formData);
}

/**
 * «Listo y avisar»: guarda lo armado (si vino), pasa el pedido a Listo con la guarda de siempre
 * (`advanceOrderStatus`, paso a paso: Nuevo → Preparando → Listo) y devuelve el WhatsApp de la
 * clienta con el aviso (`avisoPedidoListo`) más el peso real y cómo pagar si no está pago. El
 * total del aviso es el GRABADO, no el de la pantalla. Deja la constancia del aviso.
 */
export async function listoYAvisar(formData: FormData): Promise<ResultadoDelListo> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido." };

  if (formData.getAll("productId").length > 0) {
    const g = await guardarArmado(null, formData);
    if (!g || !g.ok) return { ok: false, error: g?.error ?? "No se pudo guardar lo armado." };
  }

  const fdId = new FormData();
  fdId.set("id", id);
  // A lo sumo tres pasos (Pendiente → Confirmado → Preparando → Listo); cada uno con su guarda.
  for (let paso = 0; paso < 3; paso++) {
    const actual = await prisma.order.findFirst({ where: { id, tenantId }, select: { status: true } });
    if (!actual) return { ok: false, error: "No se encontró el pedido. Volvé a la bandeja." };
    if (actual.status === "READY") break;
    if (!["PENDING", "CONFIRMED", "PREPARING"].includes(actual.status)) {
      return { ok: false, error: "Este pedido ya no está para armar: volvé a la bandeja." };
    }
    const r = await advanceOrderStatus(fdId);
    if (!r || !r.ok) return { ok: false, error: r?.error ?? "No se pudo pasar el pedido a Listo." };
  }

  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: SELECT_PEDIDO });
  if (!o || o.status !== "READY") return { ok: false, error: "No se pudo pasar el pedido a Listo." };

  const [identidad, tenant, bs, fila] = await Promise.all([
    getTenantIdentity(),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.businessSettings.findUnique({ where: { tenantId }, select: { addressLine: true, hoursLabel: true } }).catch(() => null),
    filaOriginal(tenantId, id),
  ]);
  const original = fila ? leerPedidoOriginal(fila.changes) : null;
  const actuales = lineas(o.items).filter((l) => l.productId);
  const usados = new Map<string, number>();
  const renglones = actuales.map((l) => {
    const vez = usados.get(l.productId!) ?? 0;
    usados.set(l.productId!, vez + 1);
    const pidio = original?.lineas.filter((x) => x.productId === l.productId)[vez]?.quantity ?? l.quantity;
    return { nombre: l.name, unidad: l.saleUnit, pidio, qty: l.quantity };
  });
  const base = avisoPedidoListo({
    cliente: o.customerName,
    code: o.code,
    total: Number(o.total),
    pagado: o.paid,
    fulfillment: o.fulfillment,
    direccionEnvio: o.address,
    negocio: tenant?.name ?? "el local",
    direccionLocal: bs?.addressLine?.trim() || null,
    horarioLocal: bs?.hoursLabel?.trim() || null,
    listoPara: entregaDelRubro(identidad.rubro).listoPara,
  });
  const texto = avisoDelListo(base, agregadoDelListo({ renglones, pagado: o.paid }));
  const wa = waLinkClienta(o.customerPhone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
  // La constancia («¿le avisaron?»): la misma fila que el botón de aviso de la bandeja.
  await registrarAvisoWhatsApp(id, "pedido-listo").catch(() => undefined);
  return { ok: true, mensaje: `Pedido #${o.code} listo. Se abrió el WhatsApp con el aviso.`, wa };
}

/**
 * La constancia de «Avisar la diferencia» (MG-025): quedan en la auditoría del pedido los pesos
 * que se le dijeron y el total. El mensaje sale por el WhatsApp del que atiende (link wa.me); si
 * la constancia falla, el aviso igual salió.
 */
export async function registrarAvisoDeDiferencia(
  orderId: string,
  detalle: { renglones: { nombre: string; pidio: number; peso: number }[]; totalPedido: number; total: number },
): Promise<void> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(orderId ?? "").trim();
  if (!id) return;
  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: { code: true } });
  if (!o) return;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const renglones = (Array.isArray(detalle?.renglones) ? detalle.renglones : []).slice(0, 50).map((r) => ({
    nombre: String(r?.nombre ?? "").slice(0, 80),
    pidio: formatearCantidad(num(r?.pidio)),
    peso: formatearCantidad(num(r?.peso)),
  }));
  await auditAdmin({
    action: "whatsapp",
    entity: "Order",
    entityId: id,
    changes: { tipo: TIPO_AVISO_DIFERENCIA, code: o.code, renglones, totalPedido: num(detalle?.totalPedido), total: num(detalle?.total) },
  });
}
