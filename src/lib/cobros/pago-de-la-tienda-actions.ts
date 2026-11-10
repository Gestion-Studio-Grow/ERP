"use server";

// «Pagar ahora con Mercado Pago» desde la página de Gracias de la tienda (Magra T6a). Action
// PÚBLICA: no hay sesión. Lo que prueba que el pedido es de quien pregunta es el token del redirect
// (`pago-de-la-tienda.ts`), y el monto sale SIEMPRE de la base. El link es el mismo de la bandeja
// (`armarLinkDePagoDePedido`): si ya hay uno auditado por el mismo monto, se devuelve ése.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { authSecret } from "@/lib/auth";
import { auditPublic } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { nombreVisibleDelNegocio } from "@/lib/marca-demo";
import { modoCobrosDesdeEnv } from "@/lib/mercadopago-cobros-dispatch";
import { armarLinkDePagoDePedido, VIGENCIA_LINK_DE_PEDIDO_MS } from "@/lib/cobros/link-de-pedido.server";
import {
  ACCION_LINK_DE_PAGO,
  linkDePagoDisponible,
  simuladorDeAvisosEncendido,
  tieneMercadoPago,
  ultimosLinks,
} from "@/app/admin/(dashboard)/pedidos/link-de-pago";
import {
  MENSAJE_SIN_PAGO,
  decidirPagoDeLaTienda,
  leerPedidoYToken,
  linkParaReusar,
  tokenDelPedidoValido,
} from "@/lib/cobros/pago-de-la-tienda";

export type EstadoPagoDeLaTienda = null | { ok: true; url: string; prueba: boolean } | { ok: false; error: string };

export async function pagarPedidoDeLaTienda(
  _prev: EstadoPagoDeLaTienda,
  formData: FormData,
): Promise<EstadoPagoDeLaTienda> {
  const tenantId = await getCurrentTenantId();
  const leido = leerPedidoYToken(formData.get("pedido"), formData.get("t"));
  if (!leido) return { ok: false, error: MENSAJE_SIN_PAGO.token };
  const modo = modoCobrosDesdeEnv();
  const [o, tenant] = await Promise.all([
    prisma.order.findFirst({
      where: { tenantId, code: leido.code },
      select: { id: true, code: true, tenantId: true, channel: true, status: true, paid: true, total: true, createdAt: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true, modules: true } }),
  ]);
  if (
    !linkDePagoDisponible({ modo, simulador: simuladorDeAvisosEncendido(), moduloMercadoPago: tieneMercadoPago(tenant?.modules) })
  ) {
    return { ok: false, error: MENSAJE_SIN_PAGO["sin-mp"] };
  }
  // Sin pedido, el mismo texto que un token que no corresponde: no se confirma qué números existen.
  if (!o || !tenant) return { ok: false, error: MENSAJE_SIN_PAGO.token };
  const decision = decidirPagoDeLaTienda({
    pedido: o,
    tenantId,
    tokenValido: tokenDelPedidoValido(authSecret(), tenantId, o.id, leido.token),
    ahoraMs: Date.now(),
  });
  if (!decision.ok) return { ok: false, error: MENSAJE_SIN_PAGO[decision.motivo] };

  // ¿Ya hay un link por este mismo monto? Se devuelve ése: no se crea otra preferencia en cada clic.
  const filas = await prisma.auditLog.findMany({
    where: { tenantId, entity: "Order", entityId: o.id, action: ACCION_LINK_DE_PAGO },
    select: { entityId: true, createdAt: true, changes: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const ultimo = ultimosLinks(filas).get(o.id);
  const reuso = linkParaReusar(ultimo, decision.monto, modo, {
    creadoEl: filas.find((f) => (f.changes as { url?: unknown } | null)?.url === ultimo?.url)?.createdAt,
    ahoraMs: Date.now(),
    vigenciaMs: VIGENCIA_LINK_DE_PEDIDO_MS,
  });
  if (reuso) return { ok: true, url: reuso.url, prueba: reuso.prueba };

  const r = await armarLinkDePagoDePedido({
    tenantId,
    slug: tenant.slug,
    pedido: { id: o.id, code: o.code },
    monto: decision.monto,
    negocio: nombreVisibleDelNegocio(tenant.slug, tenant.name, "el local"),
    modo,
    auditar: (e) => auditPublic(e),
    extra: { origen: "tienda" },
  });
  if (!r.ok) {
    logger.warn("tienda", "no se pudo armar el link de pago desde Gracias", { tenantId, tipo: r.tipo });
    return { ok: false, error: r.tipo === "sin-conexion" ? MENSAJE_SIN_PAGO["sin-mp"] : MENSAJE_SIN_PAGO.falla };
  }
  return { ok: true, url: r.url, prueba: modo !== "real" };
}
