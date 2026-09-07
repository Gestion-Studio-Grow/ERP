/**
 * Estado de un pedido externo — `GET /api/public/v1/orders/{code}`.
 *
 * Le permite al front externo consultar en qué anda el pedido que creó (el nº
 * `code` que devolvió el POST): el mostrador lo empuja PENDING → CONFIRMED →
 * PREPARING → READY → DELIVERED. Misma auth que el POST (tenant + api-key) y
 * scopeado por tenant: solo se ve lo del tenant autenticado.
 */

import { authenticatePublicApi, ApiError } from "@/lib/public-api-auth";
import { checkPublicApiRate, clientIpFromRequest } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withRequestId, setRequestContext } from "@/lib/request-context";

export const runtime = "nodejs";

export const GET = withRequestId(async (
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) => {
  // A-2 · El límite se aplica ANTES de parsear y ANTES de autenticar: si no, la
  // api-key de un tenant se podía fuerza-brutear sin freno y este POST floodear
  // (compute de Neon, plan free). El limitador existía y estaba testeado, pero
  // ninguna ruta lo llamaba: construido no es lo mismo que consumido.
  const espera = checkPublicApiRate(clientIpFromRequest(request));
  if (espera !== null) {
    return Response.json(
      { ok: false, error: { code: "rate_limited", message: "Demasiados pedidos. Probá de nuevo en unos segundos." } },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  try {
    const { tenantId } = await authenticatePublicApi(request);
    setRequestContext({ tenantId });
    const { code: codeRaw } = await params;
    const code = Number(codeRaw);
    if (!Number.isInteger(code) || code <= 0) {
      return Response.json(
        { ok: false, error: { code: "invalid_code", message: "El nº de pedido es inválido." } },
        { status: 400 },
      );
    }

    const order = await prisma.order.findUnique({
      where: { tenantId_code: { tenantId, code } },
      select: {
        code: true,
        status: true,
        paid: true,
        total: true,
        fulfillment: true,
        createdAt: true,
        items: { select: { name: true, quantity: true, unitPrice: true, lineTotal: true } },
      },
    });
    if (!order) {
      return Response.json(
        { ok: false, error: { code: "not_found", message: "Pedido no encontrado." } },
        { status: 404 },
      );
    }

    return Response.json({
      ok: true,
      order: {
        code: order.code,
        status: order.status,
        paid: order.paid,
        total: order.total,
        currency: "ARS",
        fulfillment: order.fulfillment,
        createdAt: order.createdAt.toISOString(),
        items: order.items,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return Response.json(
        { ok: false, error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    logger.error("api/public/orders/:code", "error", err);
    return Response.json({ ok: false, error: { code: "internal", message: "Error interno." } }, { status: 500 });
  }
});
