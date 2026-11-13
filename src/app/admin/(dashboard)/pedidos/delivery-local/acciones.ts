"use server";

// ============================================================================
// DELIVERY LOCAL · LAS ACCIONES DEL CAJÓN — «Mandar al repartidor» y «Mandar seguimiento».
// ============================================================================
//
// Cada export de un archivo "use server" es un endpoint: los dos piden `orders:manage`, toman el
// negocio de la SESIÓN (y exigen que sea el del host: el link del seguimiento se arma con él) y
// buscan el pedido por {id, tenantId}: un id de otro negocio no se encuentra y no se graba nada.
// La lógica vive en src/lib/delivery-local/salida.ts (con su test); acá sólo el acceso a datos.
//
// LA PLATA NO SE MUEVE ACÁ: lo único que se escribe es la marca «salió con el repartidor» en la
// auditoría del pedido, una sola vez (candado de la transacción sobre el pedido). Bajo el candado se
// relee cada pedido con su fila trabada en modo compartido: si uno ya no está «Listo» (lo cancelaron
// en ese instante), no se marca ninguno.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { authSecret } from "@/lib/auth";
import { pedidoPublico } from "@/lib/seo/base";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { logger } from "@/lib/logger";
import { tokenDeSeguimiento } from "@/lib/delivery-local/seguimiento";
import { rutaDeEntrega, tokenDeEntrega } from "@/lib/delivery-local/entrega";
import {
  ACCION_SALIO,
  mandarAlRepartidor as mandarAlRepartidorCore,
  mandarViajeAlRepartidor as mandarViajeCore,
  type LinkDeEntrega,
  seguimientoParaElCliente as seguimientoCore,
  type DepsDeLaSalida,
  type MarcaDeSalida,
  type ResultadoDelCajon,
} from "@/lib/delivery-local/salida";

const OTRO_NEGOCIO = "Esta sesión no es de este negocio. Volvé a entrar desde la dirección del negocio.";

async function contexto(): Promise<{ tenantId: string; slug: string | null; actor: string } | null> {
  const user = await requireCapability("orders:manage");
  const tenantId = user.tenantId;
  if (tenantId !== (await getCurrentTenantId())) return null;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return { tenantId, slug: t?.slug ?? null, actor: `user:${user.id}` };
}

function deps(actor: string): DepsDeLaSalida {
  return {
    pedido: (tenantId, orderId) =>
      prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: {
          id: true,
          code: true,
          status: true,
          fulfillment: true,
          customerName: true,
          customerPhone: true,
          address: true,
          notes: true,
          total: true,
          paid: true,
          items: { select: { name: true, quantity: true }, orderBy: { id: "asc" } },
        },
      }),
    cambiosDelAlta: async (tenantId, orderId) =>
      (
        await prisma.auditLog.findFirst({
          where: { tenantId, entity: "Order", entityId: orderId, action: "create" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { changes: true },
        })
      )?.changes ?? null,
    marcarSalidaUnaVez: (tenantId, pedidos) =>
      tenantTransaction(
        async (tx): Promise<MarcaDeSalida> => {
          await tx.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
          // Siempre en el mismo orden: dos viajes que comparten pedidos no se traban entre sí.
          const ids = [...new Set(pedidos.map((p) => p.id))].sort();
          for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery-local-salio:${tenantId}:${id}`}))`;
          await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "tenantId" = ${tenantId} AND id = ANY(${ids}::text[]) ORDER BY id FOR SHARE`;
          const ahora = await tx.order.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, status: true } });
          for (const p of pedidos) {
            if (ahora.find((o) => o.id === p.id)?.status !== "READY") return { ok: false, code: p.code };
          }
          const ya = await tx.auditLog.findMany({
            where: { tenantId, entity: "Order", entityId: { in: ids }, action: ACCION_SALIO },
            select: { entityId: true },
          });
          const salidos = new Set(ya.map((f) => f.entityId));
          const nuevas = pedidos.filter((p, i) => !salidos.has(p.id) && pedidos.findIndex((q) => q.id === p.id) === i);
          if (nuevas.length > 0) {
            await tx.auditLog.createMany({
              data: nuevas.map((p) => ({ tenantId, actor, action: ACCION_SALIO, entity: "Order", entityId: p.id, changes: { code: p.code }, channel: "admin" })),
            });
          }
          return { ok: true, nuevas: nuevas.length };
        },
        { tenantId },
      ),
  };
}

/**
 * El link «Entregué» (absoluto, firmado con su propósito para ESTE negocio). Sin origen o sin
 * secreto, null: el mensaje sale igual, sin el link (el local cierra el pedido como siempre).
 */
async function linkDeEntrega(tenantId: string): Promise<LinkDeEntrega> {
  const { origen } = await pedidoPublico();
  let secreto: string | null = null;
  try {
    secreto = authSecret();
  } catch {
    secreto = null;
  }
  return (orderId) => (origen && secreto ? `${origen}${rutaDeEntrega(tokenDeEntrega(secreto, tenantId, orderId))}` : null);
}

/** «Mandar al repartidor»: marca la salida (una vez) y devuelve el wa.me armado. */
export async function mandarAlRepartidor(orderId: string): Promise<ResultadoDelCajon> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: OTRO_NEGOCIO };
  try {
    const r = await mandarAlRepartidorCore(
      { tenantId: ctx.tenantId, slug: ctx.slug, orderId, linkDeEntrega: await linkDeEntrega(ctx.tenantId) },
      deps(ctx.actor),
    );
    if (r.ok) revalidatePath("/admin/pedidos");
    return r;
  } catch (err) {
    logger.error("delivery-local", "no se pudo mandar el pedido al repartidor", err, { tenantId: ctx.tenantId, entityId: String(orderId) });
    return { ok: false, error: "No pudimos marcar la salida ahora. Probá de nuevo en un momento." };
  }
}

/** «Mandar juntos al repartidor»: un viaje con 2+ pedidos Listos con envío, un solo wa.me. */
export async function mandarJuntosAlRepartidor(orderIds: string[]): Promise<ResultadoDelCajon> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: OTRO_NEGOCIO };
  try {
    const r = await mandarViajeCore(
      { tenantId: ctx.tenantId, slug: ctx.slug, orderIds, linkDeEntrega: await linkDeEntrega(ctx.tenantId) },
      deps(ctx.actor),
    );
    if (r.ok) revalidatePath("/admin/pedidos");
    return r;
  } catch (err) {
    logger.error("delivery-local", "no se pudo armar el viaje del repartidor", err, { tenantId: ctx.tenantId });
    return { ok: false, error: "No pudimos marcar la salida ahora. Revisá la bandeja y probá de nuevo." };
  }
}

/** «Mandar seguimiento al cliente»: el link absoluto y el wa.me al teléfono del pedido. */
export async function mandarSeguimientoAlCliente(orderId: string): Promise<ResultadoDelCajon> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: OTRO_NEGOCIO };
  const { origen } = await pedidoPublico();
  let secreto: string;
  try {
    secreto = authSecret();
  } catch {
    return { ok: false, error: "Falta la configuración del link de seguimiento. Avisale a soporte de GSG." };
  }
  return seguimientoCore(
    {
      tenantId: ctx.tenantId,
      slug: ctx.slug,
      orderId,
      origen,
      token: (id) => tokenDeSeguimiento(secreto, ctx.tenantId, id),
      waAlCliente: (tel, texto) => waLinkClienta(tel, texto),
    },
    deps(ctx.actor),
  );
}
