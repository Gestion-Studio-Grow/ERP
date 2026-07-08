import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAppointmentReminder } from "@/lib/notifications";
import { authorizeCron } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { summarizeReminderRun, type ReminderOutcome } from "@/lib/cron/reminder-batch";

// Disparador de recordatorios, pensado para ejecutarse una vez por hora vía
// cron. Protegido con CRON_SECRET para que no lo pueda llamar cualquiera
// desde afuera. FAIL-CLOSED: sin CRON_SECRET seteada el endpoint responde 503
// (no ejecuta el efecto), en vez de quedar abierto (ver `authorizeCron`).
//
// La anticipación (reminderHoursBefore) y si el recordatorio está activado
// (reminderEnabled) son config por servicio (panel /admin/recordatorios), no
// una ventana fija — por eso se trae un rango amplio (72hs) y se filtra acá
// mismo, en memoria, contra el valor de cada servicio. Tolerancia de 1h
// alrededor del punto exacto porque el cron corre cada hora.
export async function GET(request: NextRequest) {
  const auth = authorizeCron(process.env.CRON_SECRET, request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = Date.now();
  const wideWindowEnd = new Date(now + 72 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startsAt: { gte: new Date(now), lte: wideWindowEnd },
      service: { reminderEnabled: true },
    },
    include: { client: true, professional: true, service: true },
  });

  const due = appointments.filter((appt) => {
    const dueAt = appt.startsAt.getTime() - appt.service.reminderHoursBefore * 60 * 60 * 1000;
    return now >= dueAt - 30 * 60 * 1000 && now <= dueAt + 30 * 60 * 1000;
  });

  // Dead-letter $0: cada envío se aísla. Un fallo NO aborta el lote y NO se pierde
  // (no se marca `reminderSentAt` → se reintenta la próxima corrida). El resumen lo
  // arma `summarizeReminderRun` (pura, testeada).
  const outcomes: ReminderOutcome[] = [];
  for (const appt of due) {
    try {
      await sendAppointmentReminder({
        tenantId: appt.tenantId,
        clientName: appt.client.name,
        clientEmail: appt.client.email,
        clientPhone: appt.client.phone,
        serviceName: appt.service.name,
        professionalName: appt.professional.name,
        startsAt: appt.startsAt,
      });
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      outcomes.push({ ok: true, appointmentId: appt.id });
    } catch (err) {
      outcomes.push({
        ok: false,
        appointmentId: appt.id,
        tenantId: appt.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = summarizeReminderRun(appointments.length, outcomes);
  for (const f of summary.failures) {
    logger.error("reminders", "recordatorio falló; se reintenta próxima corrida", undefined, {
      appointmentId: f.appointmentId,
      tenantId: f.tenantId,
      error: f.error,
    });
  }

  return NextResponse.json(summary);
}
