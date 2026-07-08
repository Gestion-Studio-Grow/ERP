// ============================================================================
// DEAD-LETTER del cron de recordatorios — contabilidad PURA (hardening $0).
// ============================================================================
//
// Antes, el cron enviaba recordatorios en un loop sin aislar fallos: si UN envío
// tiraba, el request 500-eaba y abortaba el lote → los recordatorios siguientes de esa
// corrida NO salían. Ahora cada envío se aísla (try/catch por ítem): un fallo se
// registra como "dead-letter" (NO se marca `reminderSentAt` → se reintenta en la próxima
// corrida, no se pierde) y el lote SIGUE. Cero migración, cero costo.
//
// Se extrae la contabilidad PURA (como `cashSaleEligibility`) para testear el contrato
// —aislamiento + no perder fallos— sin DB; el efecto (enviar + marcar) vive en la route.

export type OutcomeOk = { ok: true; appointmentId: string };
export type OutcomeFail = { ok: false; appointmentId: string; tenantId: string; error: string };
export type ReminderOutcome = OutcomeOk | OutcomeFail;

export interface ReminderRunSummary {
  /** Turnos revisados (rango amplio traído de la DB). */
  checked: number;
  /** Turnos "vencidos" a los que les tocaba recordatorio esta corrida. */
  due: number;
  /** Enviados OK (marcados `reminderSentAt`). */
  sent: number;
  /** Fallados y NO perdidos: se reintentan la próxima corrida. */
  failed: number;
  /** Detalle de los fallos (para logs / observabilidad). */
  failures: OutcomeFail[];
}

/**
 * Arma el resumen del lote a partir de los resultados por-ítem. PURA. Garantiza que un
 * fallo NO reduce el conteo de enviados y que ningún fallo se pierde (queda en `failures`).
 */
export function summarizeReminderRun(
  checked: number,
  outcomes: readonly ReminderOutcome[],
): ReminderRunSummary {
  const failures = outcomes.filter((o): o is OutcomeFail => !o.ok);
  const sent = outcomes.length - failures.length;
  return {
    checked,
    due: outcomes.length,
    sent,
    failed: failures.length,
    failures,
  };
}
