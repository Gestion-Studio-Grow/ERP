/**
 * API pública de ingesta de pedidos — `POST /api/public/v1/orders`.
 *
 * La unidad de venta "backoffice-only" de ADR-020 (superficie II): un cliente
 * que YA tiene su web (hecha por su estudio) la conserva, y su front externo
 * alimenta NUESTRO backoffice. Este endpoint deja que ese front cree pedidos en
 * el sistema de un tenant, autenticado por tenant + api-key. El pedido cae en la
 * bandeja `/admin/pedidos` y dispara el flujo (stock, facturación ARCA/MP).
 *
 * Contrato completo y ejemplo de integración: docs/integrations/api-pedidos-externos.md
 *
 * Auth: header `Authorization: Bearer <api-key>` + `X-Tenant-Slug: <slug>`
 * (el slug también puede ir en el body como `tenant`). Ver `public-api-auth`.
 */

import { authenticatePublicApi, ApiError } from "@/lib/public-api-auth";
import { auditPublic } from "@/lib/audit";
import {
  parseExternalOrder,
  createExternalOrder,
} from "@/lib/external-orders";

// Node runtime: usa Prisma + node:crypto (no Edge).
export const runtime = "nodejs";

function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ ok: false, error: { code: err.code, message: err.message } }, { status: err.status });
  }
  // Errores de validación del Core (insertOrder) → 400 con el mensaje al cliente.
  if (err instanceof Error && /producto|dirección|item|precio/i.test(err.message)) {
    return Response.json({ ok: false, error: { code: "invalid_order", message: err.message } }, { status: 400 });
  }
  console.error("[api/public/orders] error inesperado:", err);
  return Response.json({ ok: false, error: { code: "internal", message: "Error interno." } }, { status: 500 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "invalid_json", message: "El body no es JSON válido." } },
      { status: 400 },
    );
  }

  try {
    const input = parseExternalOrder(body);
    const { tenantId, slug } = await authenticatePublicApi(request, input.tenant ?? null);

    const result = await createExternalOrder(tenantId, input);

    await auditPublic({
      action: "create",
      entity: "Order",
      entityId: result.id,
      clientPhone: input.customer.phone,
      changes: {
        code: result.code,
        channel: "ONLINE",
        source: "external-api",
        slug,
        total: result.total,
        externalRef: input.externalRef ?? null,
        invoiced: result.invoiced,
      },
    });

    return Response.json({ ok: true, order: result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
