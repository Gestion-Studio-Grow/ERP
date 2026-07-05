/**
 * Estado de un pedido externo — `GET /api/public/v1/orders/{code}`.
 *
 * Le permite al front externo consultar en qué anda el pedido que creó (el nº
 * `code` que devolvió el POST): el mostrador lo empuja PENDING → CONFIRMED →
 * PREPARING → READY → DELIVERED. Misma auth que el POST (tenant + api-key) y
 * scopeado por tenant: solo se ve lo del tenant autenticado.
 */

import { authenticatePublicApi, ApiError } from "@/lib/public-api-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { tenantId } = await authenticatePublicApi(request);
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
}
