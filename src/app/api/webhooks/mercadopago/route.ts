// Webhook de Mercado Pago (ADR-024 §2.d). Recibe la notificación de pago,
// VERIFICA LA FIRMA, y auto-factura el turno si el pago se acreditó.
//
// Detrás del flag maestro de facturación (isInvoicingEnabled), OFF por default:
// mientras la migración de Invoice/OutboxEvent no esté aplicada, el endpoint
// solo acusa recibo (200) sin tocar la DB — prod queda inerte y seguro.
//
// SEGURIDAD (Célula 2): con facturación ON, se valida la firma `x-signature` de MP
// (HMAC-SHA256, ver plugins/mercadopago/signature.ts) contra `MP_WEBHOOK_SECRET`
// ANTES de procesar. Un webhook forjado marcaría un pago como acreditado y
// dispararía una factura falsa → se rechaza fail-closed (secreto ausente → 503,
// firma inválida → 401). El secreto vive en env (no en DB, no depende de migración);
// hoy es único (un MP activo), mañana por-tenant (getCurrentTenantId ya resuelve el
// tenant). Resolución de tenant por URL/subdominio: follow-up.
//
// 🔧 TODO (ADR-018 §4, aislamiento de tenant en webhooks) — NO implementado a
// propósito en esta pasada (riesgoso sin poder probarlo contra credenciales
// reales de MP): `getCurrentTenantId()` (línea de abajo) resuelve por
// host/subdominio y, sin eso, cae al fallback "single-tenant" que ARROJA si
// hay ≥2 tenants activos (`src/lib/tenant.ts`). Funciona HOY porque hay una
// sola integración de MP activa (cae en la rama de 1-tenant). El día que haya
// ≥2 tenants con Mercado Pago activo simultáneamente, este endpoint necesita
// resolver el tenant desde la propia notificación (ej. `external_reference`
// o una `notification_url` distinta por integración/tenant al conectar el
// OAuth de MP) y envolver el trabajo en `runInTenantContext(tenantId, …)`
// (patrón ya probado en `src/app/api/public/v1/orders/route.ts`) — no alcanza
// con llamar a `getCurrentTenantId()` a secas como se hace hoy.

import { isInvoicingEnabled } from "@/lib/fiscal";
import { getCurrentTenantId } from "@/lib/tenant";
import { manejarNotificacionMP } from "@/lib/mercadopago-dispatch";
import { logger } from "@/lib/logger";
import { withRequestId, setRequestContext } from "@/lib/request-context";
import { verifyMercadoPagoSignature } from "@/plugins/mercadopago/signature";

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

  // --- FIRMA (fail-closed) — antes de tocar la DB o el tenant.
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    // Invoicing ON sin secreto configurado: no se puede confiar en la notificación.
    logger.error("mercadopago", "webhook rechazado: falta MP_WEBHOOK_SECRET", undefined, {
      paymentId,
    });
    return Response.json({ ok: false, error: "webhook-secret-missing" }, { status: 503 });
  }
  const firmaOk = verifyMercadoPagoSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId: paymentId,
    secret,
  });
  if (!firmaOk) {
    logger.warn("mercadopago", "webhook rechazado: firma inválida", { paymentId });
    return Response.json({ ok: false, error: "invalid-signature" }, { status: 401 });
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
