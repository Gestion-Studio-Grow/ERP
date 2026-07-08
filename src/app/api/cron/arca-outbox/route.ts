import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { processArcaOutbox } from "@/lib/arca-dispatch";

// Worker del outbox de ARCA (ADR-002 / ADR-022): drena los eventos `InvoiceCreated`
// pendientes y los despacha al plugin (emisión del comprobante + registro del CAE, o
// marca REJECTED si ARCA rechaza). Es el disparador periódico que el dispatcher
// (`processArcaOutbox`, hasta hoy "a demanda") necesitaba para cerrar el ciclo.
//
// SEGURIDAD: protegido con CRON_SECRET (fail-closed vía `authorizeCron`: sin secret →
// 503, no ejecuta; con secret inválido → 401). No lo puede disparar cualquiera.
//
// GATEADO (defensa en profundidad + costo Neon): si `ARCA_INVOICING_ENABLED` está OFF
// (default), se corta ANTES de tocar la DB — sin la migración aplicada + el flag no hay
// facturas ni outbox que procesar, así que evitamos hasta la query. Cuando el dueño
// encienda ARCA real (§C·I3) + aplique las migraciones (§C·I2), el worker pasa a emitir.
//
// CADENCIA: registrado en `vercel.json` a diario (compatible con el plan actual). Cuando
// ARCA esté en real y se necesite menor latencia de emisión, apretar la frecuencia del
// cron (requiere el plan de Vercel que lo permita).

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Fail-closed y barato: si la facturación no está encendida, no hay nada que drenar.
  if (!isInvoicingEnabled()) {
    return NextResponse.json({ skipped: true, reason: "ARCA_INVOICING_ENABLED off" });
  }

  const resumen = await processArcaOutbox();
  return NextResponse.json({ ok: true, ...resumen });
}
