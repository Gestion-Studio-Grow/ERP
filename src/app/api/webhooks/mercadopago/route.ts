// Webhook de Mercado Pago (ADR-024 §2.d). Recibe la notificación de pago,
// verifica contra MP (hoy stub) y auto-factura el turno si el pago se acreditó.
//
// Detrás del flag maestro de facturación (isInvoicingEnabled), OFF por default:
// mientras la migración de Invoice/OutboxEvent no esté aplicada, el endpoint
// solo acusa recibo (200) sin tocar la DB — prod queda inerte y seguro.
//
// TODO(ADR-024): validar la firma `x-signature` de MP contra el `webhookSecret`
// del tenant (hoy no hay credenciales). Resolución de tenant: hoy única
// (getCurrentTenantId); mañana por la URL/subdominio del webhook.

import { isInvoicingEnabled } from "@/lib/fiscal";
import { getCurrentTenantId } from "@/lib/tenant";
import { manejarNotificacionMP } from "@/lib/mercadopago-dispatch";
import { logger } from "@/lib/logger";
import { withRequestId, setRequestContext } from "@/lib/request-context";

export const POST = withRequestId(async (request: Request) => {
  if (!isInvoicingEnabled()) {
    // Facturación deshabilitada: acusar recibo para que MP no reintente.
    return Response.json({ ok: true, skipped: "invoicing-disabled" });
  }

  const url = new URL(request.url);
  // MP notifica el tipo y el id del recurso por query (IPN) o body (webhooks v2).
  let type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  let paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";

  if (!type || !paymentId) {
    try {
      const body = (await request.json()) as {
        type?: string;
        action?: string;
        data?: { id?: string };
      };
      type = type || body.type || (body.action?.startsWith("payment") ? "payment" : "");
      paymentId = paymentId || body.data?.id || "";
    } catch {
      // sin body JSON válido; seguimos con lo que haya en la query
    }
  }

  if (type !== "payment" || !paymentId) {
    return Response.json({ ok: true, ignored: { type, paymentId } });
  }

  const tenantId = await getCurrentTenantId();
  setRequestContext({ tenantId, paymentId });

  try {
    const resultado = await manejarNotificacionMP({ type, paymentId, tenantId });
    return Response.json({ ok: true, resultado });
  } catch (err) {
    // Error transitorio (MP caído, etc.): 500 para que MP reintente.
    logger.error("mercadopago", "webhook falló", err, { paymentId, tenantId });
    return Response.json({ ok: false }, { status: 500 });
  }
});
