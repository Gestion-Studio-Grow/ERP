import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { correrResetsPendientesEnLaBase } from "@/lib/claves-pendientes.server";

// Reseteos pendientes declarados en código (GSG-SEG-014, `src/lib/claves-pendientes.ts`): resetea la
// clave del dueño de un negocio y le manda la provisoria por mail, sin que nadie toque la consola.
//
// SEGURIDAD: CRON_SECRET, fail-closed (`authorizeCron`: sin secret → 503; inválido → 401).
// IDEMPOTENTE: cada pendiente tiene una clave única que queda en la auditoría del reseteo; una
// corrida repetida no resetea de nuevo. Si el mail no sale, no cambia nada y se reintenta mañana.
// SALIDA: sólo la clave, el estado y el destino enmascarado. Nunca la contraseña ni el email entero.
// CADENCIA: diaria (`vercel.json`; el plan Hobby no permite más). Corre sólo en producción.

export const dynamic = "force-dynamic";

async function correr(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const resultados = await correrResetsPendientesEnLaBase();
  return NextResponse.json({ ok: true, resultados });
}

export async function GET(request: NextRequest) {
  return correr(request);
}

export async function POST(request: NextRequest) {
  return correr(request);
}
