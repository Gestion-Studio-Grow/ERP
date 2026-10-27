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
import { updateOrderItems, type OrderActionState } from "@/lib/order-actions";
import { ajustarPedidoInTx, avanzarPedidoGuarded, avisoPedidoListo } from "@/lib/order-anulacion";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { permiteVenderSinStock } from "@/lib/stock/pos-stock-rules";
import { negocioConOfertas, promosParaUnaVenta } from "@/lib/supermercado/promos-del-negocio";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { entregaDelRubro } from "@/blueprints/retail/rubros";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { cantidadOCero, formatearCantidad } from "@/lib/pos-peso";
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
//
// TANDA PERF (P-4): antes eran 271 sentencias / 50 transacciones — `guardarArmado` +
// `updateOrderItems` + hasta tres `advanceOrderStatus` + `registrarAvisoWhatsApp`, cada uno con su
// sesión, su lectura del pedido, su `auditAdmin` y su `revalidatePath` — y el `revalidatePath` hacía
// que la respuesta de la acción volviera a dibujar Armar entera justo antes de que la pantalla se
// fuera a la bandeja (la doble re-renderización). Ahora: UNA sesión, una tanda de lecturas en
// paralelo y UNA transacción con las MISMAS reglas (`ajustarPedidoInTx` con los mismos argumentos
// que `updateOrderItems`; `avanzarPedidoGuarded` con su compare-and-set) y las mismas filas de
// auditoría en un solo INSERT. Sin `revalidatePath`: la pantalla navega a la bandeja (dinámica,
// sin caché de router) y ésa es la única re-renderización.

/** Los renglones del formulario, leídos como `updateOrderItems` (`parseItems` + cantidad > 0). */
function renglonesPedidos(formData: FormData): { productId: string; qty: number }[] {
  const ids = formData.getAll("productId").map(String);
  const cantidades = formData.getAll("quantity").map((q) => cantidadOCero(String(q)));
  return ids.map((productId, i) => ({ productId, qty: cantidades[i] })).filter((l) => l.productId && l.qty > 0);
}

type FilaDeAuditoria = { action: string; changes: Record<string, unknown> };

export async function listoYAvisar(formData: FormData): Promise<ResultadoDelListo> {
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido." };
  const conArmado = formData.getAll("productId").length > 0;
  const pedidas = conArmado ? renglonesPedidos(formData) : [];

  // Una tanda: el pedido, la fila original, el negocio y si tiene ofertas (sólo si se guarda).
  const [antes, fila, identidad, tenant, bs, conOfertas] = await Promise.all([
    prisma.order.findFirst({ where: { id, tenantId }, select: { ...SELECT_PEDIDO, createdAt: true } }),
    filaOriginal(tenantId, id),
    getTenantIdentity(),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.businessSettings.findUnique({ where: { tenantId }, select: { addressLine: true, hoursLabel: true } }).catch(() => null),
    conArmado ? negocioConOfertas(tenantId) : Promise.resolve(false),
  ]);
  if (!antes) return { ok: false, error: "No se encontró el pedido. Volvé a la bandeja." };
  // Las ofertas con las que se tomó el pedido (las del día en que se tomó), como `updateOrderItems`.
  const promociones = conArmado && conOfertas
    ? await promosParaUnaVenta(tenantId, pedidas.map((l) => l.productId), dateStrInBusinessTz(antes.createdAt), null)
    : undefined;
  const actor = `user:${user.id}`;
  const originalDeAntes = pedidoOriginalDe({ items: lineas(antes.items), subtotal: Number(antes.subtotal), discount: Number(antes.discount), total: Number(antes.total) });

  type Salida = { ok: false; error: string; auditar: FilaDeAuditoria[] } | { ok: true; o: typeof antes; auditar: FilaDeAuditoria[] };
  let salida: Salida;
  try {
    salida = await tenantTransaction(
      async (tx): Promise<Salida> => {
        const auditar: FilaDeAuditoria[] = [];
        if (conArmado) {
          // Lo que pidió la clienta, UNA vez, antes del primer ajuste (lo mismo que `guardarArmado`).
          if (!antes.paid && !fila) auditar.push({ action: ACCION_PEDIDO_ORIGINAL, changes: { code: antes.code, ...originalDeAntes } });
          const out = await ajustarPedidoInTx(tx, tenantId, {
            orderId: id,
            pedidas,
            actor,
            promociones,
            permiteNegativo: (saleUnit) => permiteVenderSinStock({ saleUnit, contexto: "EDICION_PESO_REAL" }),
          });
          auditar.push({
            action: "update",
            changes: {
              total: { from: out.antes, to: out.total },
              ...(out.descuentoAntes !== out.descuento ? { discount: { from: out.descuentoAntes, to: out.descuento } } : {}),
              lines: pedidas.length,
            },
          });
        }
        // A lo sumo tres pasos (Pendiente → Confirmado → Preparando → Listo); cada uno con su guarda.
        for (let paso = 0; paso < 3; paso++) {
          const actual = await tx.order.findFirst({ where: { id, tenantId }, select: { status: true } });
          if (!actual) return { ok: false, error: "No se encontró el pedido. Volvé a la bandeja.", auditar };
          if (actual.status === "READY") break;
          if (!["PENDING", "CONFIRMED", "PREPARING"].includes(actual.status)) {
            return { ok: false, error: "Este pedido ya no está para armar: volvé a la bandeja.", auditar };
          }
          const r = await avanzarPedidoGuarded({
            comercio: identidad.isRetail,
            leer: async () => actual,
            escribir: async (from, to) =>
              (await tx.order.updateMany({ where: { id, tenantId, status: from }, data: { status: to } })).count > 0,
          });
          if (!r.ok) return { ok: false, error: r.error, auditar };
          auditar.push({ action: "update", changes: { status: { from: r.from, to: r.to } } });
        }
        const o = await tx.order.findFirst({ where: { id, tenantId }, select: { ...SELECT_PEDIDO, createdAt: true } });
        if (!o || o.status !== "READY") return { ok: false, error: "No se pudo pasar el pedido a Listo.", auditar };
        // La constancia («¿le avisaron?»): la misma fila que el botón de aviso de la bandeja.
        auditar.push({ action: "whatsapp", changes: { tipo: "pedido-listo", code: o.code } });
        return { ok: true, o, auditar };
      },
      { tenantId },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "No se pudo guardar lo armado." };
  }
  // Las filas de auditoría en UN insert. Como `audit()`, nunca tumba la operación: si falla, queda
  // en el log del servidor.
  if (salida.auditar.length > 0) {
    await prisma.auditLog
      .createMany({
        data: salida.auditar.map((a) => ({
          tenantId,
          actor,
          action: a.action,
          entity: "Order",
          entityId: id,
          changes: JSON.parse(JSON.stringify(a.changes)),
          channel: "admin",
        })),
      })
      .catch((err) => logger.error("audit", "no se pudo registrar «Listo y avisar»", err, { entityId: id }));
  }
  if (!salida.ok) return { ok: false, error: salida.error };
  const o = salida.o;
  // Sin fila previa, lo pedido es lo que tenía el pedido antes de este ajuste (la fila que se acaba
  // de escribir); sin ajuste, lo de hoy.
  const original = fila ? leerPedidoOriginal(fila.changes) : conArmado && !antes.paid ? originalDeAntes : null;
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
