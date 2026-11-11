// PROFETURNOS · Webhook del abono mensual por Mercado Pago (cuenta de GSG). La lógica, con sus
// garantías (firma, re-lectura en MP, monto/moneda/referencia, idempotencia por paymentId), está en
// src/lib/profeturnos/webhook-mp.server.ts. El portón del sitio no la tapa: `/api` está siempre
// abierta (src/lib/site-gate.ts, SIEMPRE_ABIERTAS; lo prueba webhook-mp.test.ts).

import { atenderAvisoProfeturnos } from "@/lib/profeturnos/webhook-mp.server";
import { withRequestId } from "@/lib/request-context";

export const maxDuration = 60;

export const POST = withRequestId((request: Request) => atenderAvisoProfeturnos(request));
