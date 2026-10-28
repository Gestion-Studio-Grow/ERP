/**
 * Health check del Core — `GET /api/health`.
 *
 * SHALLOW a propósito: responde que el proceso está vivo y con qué commit corre,
 * SIN pegarle a la base. En el plan free de Neon un health chequeado seguido por
 * un uptime monitor sumaría compute/conexiones inútiles; la liveness del proceso
 * ya es señal suficiente para "¿está levantado el deploy?". La readiness con base
 * (y el semáforo del motor ARCA) vive en `/api/ready`.
 *
 * Bloque `arca` (sin base): cómo está CONFIGURADA la facturación en este deploy — llave global,
 * modo (stub / homologacion / real) y si el cron tiene su secreto — más el resumen de los flags
 * por negocio de la suite (cuántos negocios por flag, nunca cuáles). Ningún valor de secreto.
 * Sirve para el smoke post-deploy: «¿quedó ARCA en el modo que quería?».
 */

import { withRequestId } from "@/lib/request-context";
import { resumirFlags } from "@/lib/flags/facturacion";
import { configMotorArca } from "../ready/motor-arca";

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
      arca: { ...configMotorArca(process.env), flags: resumirFlags(process.env) },
      ts: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  ),
);
