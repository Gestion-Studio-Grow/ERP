// Webhook de Mercado Pago (ADR-024 §2.d). Recibe la notificación de pago, la verifica y la
// atribuye a SU negocio por la conexión, nunca por el host (Tanda S1).
//
// Todo el aviso vive en `atenderAvisoMP` (src/lib/mercadopago-dispatch.ts), testeable sin Next:
//   rate limit → secretos (503 sin ninguno) → firma y `ts` ±5 min (401) → tipo → pago leído en MP
//   con el `data.id` firmado → negocio por `external_reference` `gsg:<slug>:<tipo>:<id>`
//   (src/lib/webhooks/resolver-negocio.ts) → firma del negocio (MP_WEBHOOK_SECRETS) o global con
//   aviso → `runInTenantContext(negocio)`.
// Sin negocio válido: 200 sin efecto + AuditLog `rechazado` (MP no reintenta en bucle).
//
// Ya NO pasa por `isInvoicingEnabled()`: cobrar un pedido no depende de facturar. La facturación
// (turnos y ventas sueltas) sigue detrás del flag, adentro del dispatch.
// Variables y formato: docs/runbooks/webhooks-por-negocio.md.

import { atenderAvisoMP } from "@/lib/mercadopago-dispatch";
import { withRequestId } from "@/lib/request-context";

export const POST = withRequestId((request: Request) => atenderAvisoMP(request));
