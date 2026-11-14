import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { drenarCola } from "@/lib/soporte/despacho.server";

// Drena la cola de despachos de soporte (MANT-004, diseño §15.3): dispara los pendientes a los que les
// toca el reintento (1/5/15 min) y vence los disparados de más de 30 min sin borrador.
//
// SEGURIDAD: CRON_SECRET fail-closed vía `authorizeCron` (sin secreto → 503; bearer malo → 401).
// GATEADO: con MANT_MOTOR apagado (el defecto) corta antes de tocar la base.
// CADENCIA: la da un programador externo (GET o POST con el bearer). No se agregó a vercel.json: la
// frecuencia y el plan los decide el dueño (§15.3 «plan y frecuencia a validar»).

export const dynamic = "force-dynamic";

async function drenar(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const resumen = await drenarCola();
  return NextResponse.json(resumen.apagado ? { skipped: true, reason: resumen.motivo } : { ok: true, ...resumen });
}

export async function GET(request: NextRequest) {
  return drenar(request);
}

export async function POST(request: NextRequest) {
  return drenar(request);
}
