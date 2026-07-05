/**
 * Health check del Core — `GET /api/health`.
 *
 * SHALLOW a propósito: responde que el proceso está vivo y con qué commit corre,
 * SIN pegarle a la base. En el plan free de Neon un health chequeado seguido por
 * un uptime monitor sumaría compute/conexiones inútiles; la liveness del proceso
 * ya es señal suficiente para "¿está levantado el deploy?". Un readiness con
 * `SELECT 1` se puede agregar el día que haya presupuesto de DB (queda anotado).
 */

import { withRequestId } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Commit del deploy, según lo exponga la plataforma (Netlify: COMMIT_REF ·
// Vercel: VERCEL_GIT_COMMIT_SHA). "unknown" en local.
function commitRef(): string {
  return (
    process.env.COMMIT_REF ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    "unknown"
  );
}

export const GET = withRequestId(() =>
  Response.json(
    {
      status: "ok",
      commit: commitRef(),
      uptimeSeconds: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  ),
);
