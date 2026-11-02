import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { runReminderSweep } from "@/lib/cron/reminder-sweep";

// Disparador de recordatorios, pensado para ejecutarse una vez por hora vía
// cron. Protegido con CRON_SECRET para que no lo pueda llamar cualquiera
// desde afuera. FAIL-CLOSED: sin CRON_SECRET seteada el endpoint responde 503
// (no ejecuta el efecto), en vez de quedar abierto (ver `authorizeCron`).
//
// Wrapper delgado (mismo patrón que `cron/arca-outbox`): la anticipación
// (reminderHoursBefore), si el recordatorio está activado (reminderEnabled) y
// el barrido cross-tenant + el aislamiento por tenant viven en
// `runReminderSweep` (`src/lib/cron/reminder-sweep.ts`), testeable sin
// `NextRequest`.
export async function GET(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const summary = await runReminderSweep();
  for (const f of summary.failures) {
    logger.error("reminders", "recordatorio no enviado", undefined, {
      appointmentId: f.appointmentId,
      tenantId: f.tenantId,
      error: f.error,
    });
  }

  // Va en este mismo cron para no sumar otro al plan de Vercel. Si falla, los recordatorios de turnos ya salieron.
  const avisosProyectos = await import("@/lib/proyectos/avisos-programados.server")
    .then((m) => m.barrerAvisosDeProyectos())
    .catch((e) => {
      logger.error("reminders", "avisos de proyectos sin correr", e);
      return null;
    });

  return NextResponse.json({ ...summary, avisosProyectos });
}
