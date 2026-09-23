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
import { debeEstamparRecordatorio, motivoSinEnvio } from "@/lib/turnos/turno-abierto";

const WIDE_WINDOW_MS = 72 * 60 * 60 * 1000;
// LA VENTANA NO SE TOCA en este cambio, y es a propósito. Con el cron diario de vercel.json
// (`0 12 * * *`, 09:00 de acá) y ±30 min alrededor de `startsAt - reminderHoursBefore`, con
// las 24 h por defecto sólo entran los turnos de mañana entre 08:30 y 09:30 (cuentas sobre
// el código, no medido en producción): los de las 10 a las 19 no reciben aviso automático.
// Ensancharla ("todo mañana") haría que la PRIMERA corrida mande de golpe mails reales a
// todas las clientas con turno mañana si RESEND_API_KEY está cargada en producción —no se
// pudo medir—, y eso es exposición a clientas: lo decide el dueño. Mientras tanto la
// confirmación de mañana se hace a mano desde /admin/turnos ("Mañana: confirmar").
const TOLERANCE_MS = 30 * 60 * 1000;

/**
 * Corre el barrido de recordatorios: trae los turnos confirmados sin
 * recordatorio enviado de TODOS los tenants (rango amplio de 72hs), filtra los
 * que "vencen" en esta corrida, envía y marca `reminderSentAt` por turno.
 *
 * Dead-letter $0 (igual que antes): un fallo por turno NO aborta el lote y NO
 * se marca `reminderSentAt`. Ojo: con la ventana de ±30 min, "se reintenta la próxima
 * corrida" sólo es cierto si la próxima corrida cae dentro de la ventana; con el cron
 * diario, no cae. Si el turno es de mañana, sigue apareciendo sin "avisada" en "Mañana:
 * confirmar" (/admin/turnos), que es por donde se lo avisa a mano.
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
      const enviado = await tenantTransaction(
        async (tx) => {
          const resultados = await sendAppointmentReminder({
            tenantId: appt.tenantId,
            clientName: appt.client.name,
            clientEmail: appt.client.email,
            clientPhone: appt.client.phone,
            serviceName: appt.service.name,
            professionalName: appt.professional.name,
            startsAt: appt.startsAt,
          });
          // "Avisada" sólo si ALGÚN canal dijo que mandó. Antes se estampaba siempre: con el
          // WhatsApp simulado (`sent:false` sin error) y sin RESEND_API_KEY, el turno quedaba
          // como avisado sin que saliera nada, y ya no volvía a entrar en ningún barrido.
          if (!debeEstamparRecordatorio(resultados)) return { ok: false as const, motivo: motivoSinEnvio(resultados) };
          // `updateMany` acotado por tenant además del GUC: la lectura de arriba es cross-tenant
          // (operatorPrisma) y la escritura no puede depender sólo de que el id sea el correcto.
          await tx.appointment.updateMany({
            where: { id: appt.id, tenantId: appt.tenantId },
            data: { reminderSentAt: new Date() },
          });
          return { ok: true as const };
        },
        { tenantId: appt.tenantId },
      );
      // Lo no enviado se informa como fallo —sale en el log del cron con el motivo por canal—
      // en vez de sumarse a "enviados", que era el número que mentía.
      outcomes.push(
        enviado.ok
          ? { ok: true, appointmentId: appt.id }
          : { ok: false, appointmentId: appt.id, tenantId: appt.tenantId, error: enviado.motivo },
      );
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
