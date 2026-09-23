// COMISIONES A LIQUIDAR — lo pendiente por profesional, el botón para liquidar y el historial.
//
// Es la sección de comisiones de Reportes, como app propia. Reportes la sigue mostrando IGUAL
// (CH liquida desde ahí y su pantalla no cambia sin el OK del dueño): cuando CH pase al
// Inicio por apps, esa sección se va y queda sólo ésta. Las dos postean a la MISMA acción
// (`settleCommissions`), con la misma base de cálculo; ésta además le dice a dónde volver.
// Acá los controles miden 44 px: se liquida también desde el celular.
//
// La base de cálculo no se decide acá (reports/comisiones.ts): lo pendiente llega calculado.

import { settleCommissions, type PayoutHistoryRow, type PendingCommission } from "@/lib/commission-actions";
import { fmtShortDate } from "@/lib/datetime";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";
import type { VueltaDeLiquidacion } from "@/lib/reports/comisiones";

const money = (n: number) => fmtMoneyARS(n, 0);

export default function ComisionesPendientes({
  overview,
  canSettle,
  volver,
}: {
  overview: { pending: PendingCommission[]; history: PayoutHistoryRow[] };
  /** Sólo quien tiene commissions:manage ve el botón de liquidar. */
  canSettle: boolean;
  /** A qué pantalla vuelve la liquidación. */
  volver: VueltaDeLiquidacion;
}) {
  return (
    <>
      {/* Comisiones pendientes de pago (liquidación por período) */}
      <div className="rounded-lg border border-line p-4 mb-4">
        <h3 className="font-medium mb-1">Comisiones pendientes de pago</h3>
        <p className="text-xs text-muted mb-4">
          Sobre turnos completados y cobrados que todavía no se liquidaron, según el % configurado
          por profesional. Al liquidar, el monto queda congelado y esos turnos dejan de figurar acá.
        </p>
        {overview.pending.length === 0 && (
          <p className="text-sm text-muted">No hay comisiones pendientes de liquidar.</p>
        )}
        <div className="space-y-3">
          {overview.pending.map((c) => (
            <div
              key={c.professionalId}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-line pt-3 first:border-t-0 first:pt-0"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {c.professionalName} —{" "}
                  <span className="text-strong tabular-nums">{money(c.amount)}</span>
                </p>
                <p className="text-xs text-muted">
                  {c.appointmentCount} {c.appointmentCount === 1 ? "turno" : "turnos"} · sobre{" "}
                  {money(c.ingresos)}
                  {c.periodStart && c.periodEnd && (
                    <> · {fmtShortDate(c.periodStart)} a {fmtShortDate(c.periodEnd)}</>
                  )}
                </p>
              </div>
              {canSettle && (
                <form action={settleCommissions} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="professionalId" value={c.professionalId} />
                  {/* A qué pantalla vuelve la liquidación (Reportes o Comisiones). */}
                  <input type="hidden" name="volver" value={volver} />
                  {/* Por qué medio se le pagó. El campo existía del lado del servidor
                      (`parseCashMethod`) y el formulario no lo preguntaba, así que el egreso
                      del libro asumía siempre EFECTIVO. Hoy todas las liquidaciones fueron
                      en efectivo y por eso el default venía dando bien — pero dar bien por
                      casualidad es justo lo que se está sacando del sistema: si se paga por
                      transferencia, el arqueo cierra con faltante en efectivo y sobrante en
                      MP por el mismo importe. Preselecciona efectivo porque es el caso real
                      dominante, y ahora se puede cambiar. */}
                  <select
                    name="method"
                    defaultValue="EFECTIVO"
                    aria-label="Cómo se le pagó"
                    className="h-11 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="MP">Transferencia / MP</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                  <input
                    name="note"
                    placeholder="Nota (opcional)"
                    className="h-11 w-40 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent"
                  />
                  <SubmitButton
                    pendingText="Liquidando…"
                    className={buttonClasses("solid", "md", "whitespace-nowrap")}
                  >
                    Marcar pagada
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Historial de liquidaciones */}
      <div className="rounded-lg border border-line p-4">
        <h3 className="font-medium mb-1">Historial de liquidaciones</h3>
        <p className="text-xs text-muted mb-4">
          Comprobantes de comisiones ya pagadas. El monto es el que se liquidó en ese momento.
        </p>
        {overview.history.length === 0 && (
          <p className="text-sm text-muted">Todavía no se liquidó ninguna comisión.</p>
        )}
        <div className="space-y-2">
          {overview.history.map((h) => (
            <div key={h.id} className="flex justify-between gap-4 text-sm border-t border-line pt-2 first:border-t-0 first:pt-0">
              <div>
                <p className="font-medium">{h.professionalName}</p>
                <p className="text-xs text-muted">
                  {fmtShortDate(h.periodStart)} a {fmtShortDate(h.periodEnd)} · {h.appointmentCount}{" "}
                  {h.appointmentCount === 1 ? "turno" : "turnos"} · pagada {fmtShortDate(h.createdAt)}
                  {h.note && <> · {h.note}</>}
                </p>
              </div>
              <span className="font-medium whitespace-nowrap tabular-nums">{money(h.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
