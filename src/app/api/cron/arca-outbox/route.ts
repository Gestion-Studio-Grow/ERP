import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { processArcaOutbox } from "@/lib/arca-dispatch";
import { reintentarDevolucionesDeLosNegocios } from "@/lib/facturacion/devoluciones-mp";

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
// CADENCIA: la da un PROGRAMADOR EXTERNO que llama a esta ruta con `Authorization: Bearer
// <CRON_SECRET>` (por eso acepta GET y POST: muchos programadores externos sólo hacen POST).
// `vercel.json` queda diario a propósito (plan Hobby: no permite más) como red de seguridad.
// La escalera de reintentos (1/5/15/60 min, ventana de 24 h) está en arca-reintentos.ts: fija
// el mínimo entre intentos; el ritmo real depende de cada cuánto llame el programador.
//
// NEGOCIOS: `processArcaOutbox` recorre los negocios y despacha cada envío parado en el suyo,
// con la conexión de la app. No necesita una conexión que vea todo (ver arca-dispatch.ts).

export const dynamic = "force-dynamic";

async function drenarOutbox(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Fail-closed y barato: si la facturación no está encendida, no hay nada que drenar.
  if (!isInvoicingEnabled()) {
    return NextResponse.json({ skipped: true, reason: "ARCA_INVOICING_ENABLED off" });
  }

  const resumen = await processArcaOutbox();
  // PR5 · C2/esperar_cae: después de drenar (cuando aparecen los CAE), las devoluciones de MP que
  // esperaban su factura o su CAE se vuelven a probar. Una falla no tapa el resumen de ARCA.
  let devoluciones: Awaited<ReturnType<typeof reintentarDevolucionesDeLosNegocios>> | { error: string };
  try {
    devoluciones = await reintentarDevolucionesDeLosNegocios();
  } catch (e) {
    devoluciones = { error: e instanceof Error ? e.message : "falló" };
  }
  return NextResponse.json({ ok: true, ...resumen, devoluciones });
}

export async function GET(request: NextRequest) {
  return drenarOutbox(request);
}

export async function POST(request: NextRequest) {
  return drenarOutbox(request);
}
