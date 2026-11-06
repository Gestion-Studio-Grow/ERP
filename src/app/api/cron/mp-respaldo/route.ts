import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { DEPS_RESPALDO_MP, sincronizarRespaldoMP } from "@/lib/mercadopago-respaldo.server";

// Respaldo de los avisos de Mercado Pago (src/lib/mercadopago-respaldo.server.ts).
//
// SEGURIDAD: CRON_SECRET, fail-closed (`authorizeCron`: sin secret → 503; inválido → 401).
// CADENCIA: la decide el dueño. NO va en vercel.json: en Hobby un cron de menos de un día rompe el
// deploy (lección PD-3). La llama un programador externo cada 15 minutos (o una vez por día).
// HOY EN SECO: clasifica y cuenta; no guarda ni factura hasta el contrato de estados.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const resumen = await sincronizarRespaldoMP(DEPS_RESPALDO_MP);
  return NextResponse.json({ ok: true, enSeco: true, ...resumen });
}
