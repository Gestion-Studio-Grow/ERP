// ============================================================================
// BARRIDO de recordatorios (worker del cron) — aislamiento de tenant.
// ============================================================================
//
// Extraído de `src/app/api/cron/reminders/route.ts` (que ahora es un wrapper
// delgado: auth + llamar acá + loguear + responder), mismo patrón que
// `processArcaOutbox` (`src/lib/arca-dispatch.ts`) — separa el efecto (DB,
// envío) de la contabilidad pura (`summarizeReminderRun`, `reminder-batch.ts`)
// y lo hace testeable sin pasar por un `NextRequest`.
//
// AISLAMIENTO DE TENANT (ADR-018 §4): este worker corre sin request/host —
// `getCurrentTenantId()` ambiental rompe apenas hay >1 tenant bajo RLS. El
// barrido CROSS-TENANT (turnos de TODOS los tenants, una sola pasada) usa
// `operatorPrisma` (rol dueño, bypassa RLS por diseño, ADR-021) — nunca el
// `prisma` conmutado por RLS para esta lectura. El envío + el marcado de CADA
// turno quedan atados a SU tenant vía `tenantTransaction(fn, { tenantId })`
// (cubre también la lectura de `MessageTemplate` que hace `notifications.ts`
// por dentro, vía su propio `tenantTransaction`).

import { operatorPrisma } from "@/lib/operator-db";
import { tenantTransaction } from "@/lib/rls";
import { sendAppointmentReminder } from "@/lib/notifications";
import { summarizeReminderRun, type ReminderOutcome, type ReminderRunSummary } from "@/lib/cron/reminder-batch";

const WIDE_WINDOW_MS = 72 * 60 * 60 * 1000;
const TOLERANCE_MS = 30 * 60 * 1000;

/**
 * Corre el barrido de recordatorios: trae los turnos confirmados sin
 * recordatorio enviado de TODOS los tenants (rango amplio de 72hs), filtra los
 * que "vencen" en esta corrida, envía y marca `reminderSentAt` por turno.
 *
 * Dead-letter $0 (igual que antes): un fallo por turno NO aborta el lote y NO
 * se pierde (no se marca `reminderSentAt` → se reintenta la próxima corrida).
 */
export async function runReminderSweep(now = Date.now()): Promise<ReminderRunSummary> {
  const wideWindowEnd = new Date(now + WIDE_WINDOW_MS);

  const appointments = await operatorPrisma.appointment.findMany({
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
    return now >= dueAt - TOLERANCE_MS && now <= dueAt + TOLERANCE_MS;
  });

  const outcomes: ReminderOutcome[] = [];
  for (const appt of due) {
    try {
      // Todo lo de ESTE turno (envío + marcado) atado a SU tenant: setea el GUC
      // antes de que `sendAppointmentReminder` lea su MessageTemplate y antes
      // del UPDATE. Con RLS_ENFORCEMENT off es exactamente el comportamiento
      // de siempre (tenantTransaction = basePrisma.$transaction sin más).
      await tenantTransaction(
        async (tx) => {
          await sendAppointmentReminder({
            tenantId: appt.tenantId,
            clientName: appt.client.name,
            clientEmail: appt.client.email,
            clientPhone: appt.client.phone,
            serviceName: appt.service.name,
            professionalName: appt.professional.name,
            startsAt: appt.startsAt,
          });
          await tx.appointment.update({
            where: { id: appt.id },
            data: { reminderSentAt: new Date() },
          });
        },
        { tenantId: appt.tenantId },
      );
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

  return summarizeReminderRun(appointments.length, outcomes);
}
