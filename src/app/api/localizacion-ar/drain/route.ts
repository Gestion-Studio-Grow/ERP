import { NextRequest, NextResponse } from "next/server";
import { drainOutbox } from "@/lib/localizacion-ar";

// Drenado de la outbox de localización fiscal (ADR-019 D3). Pensado para correr
// periódicamente vía Netlify Scheduled Function — la red que garantiza que
// ningún comprobante quede sin CAE si el intento síncrono falló. Protegido con
// CRON_SECRET (mismo patrón que /api/cron/reminders). Inerte mientras
// LOCALIZACION_AR_ENABLED no esté en "true".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (process.env.LOCALIZACION_AR_ENABLED !== "true") {
    return NextResponse.json({ skipped: "LOCALIZACION_AR_ENABLED != true" });
  }

  const result = await drainOutbox();
  return NextResponse.json(result);
}
