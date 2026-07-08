/**
 * Readiness check del Core — `GET /api/ready`.
 *
 * A diferencia de `/api/health` (SHALLOW, solo liveness del proceso), este endpoint
 * confirma que la app puede REALMENTE atender: hace un `SELECT 1` contra la base. Sirve
 * para el gate de deploy / health-check de plataforma ("¿está listo para recibir
 * tráfico?"). Devuelve 200 `{ready:true}` o **503** `{ready:false}` si la DB no responde
 * — así un balanceador / deploy no manda tráfico a una instancia sin base.
 *
 * Costo $0: un `SELECT 1` es despreciable. Pensado para el chequeo del deploy, NO para un
 * uptime-monitor en loop cerrado (para eso está `/api/health`, sin DB). Usa `basePrisma`
 * (cliente crudo, sin RLS): la readiness es de infraestructura, no depende del tenant.
 */

import { basePrisma } from "@/lib/prisma-base";
import { withRequestId } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestId(async () => {
  try {
    await basePrisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ready", ts: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      {
        status: "not-ready",
        error: err instanceof Error ? err.message : "db-unreachable",
        ts: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
});
