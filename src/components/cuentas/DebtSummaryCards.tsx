import { fmtMoneyARS } from "@/components/ui";
import type { AgingResumen } from "@/lib/cuentas/aging";

// Resumen de deuda (server, presentacional): total + vencido (danger) + por vencer
// (warning). Los tints de vencido/por-vencer son el semáforo de aging — única excepción
// al canal neutro (ADR-059 D5). Reusado por ambas pantallas (a cobrar / a pagar).
export function DebtSummaryCards({ resumen, totalLabel }: { resumen: AgingResumen; totalLabel: string }) {
  return (
    <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm text-muted">{totalLabel}</p>
        <p className="text-2xl font-semibold tabular-nums text-strong">{fmtMoneyARS(resumen.total)}</p>
        <p className="mt-1 text-xs text-muted">{resumen.cuentas} {resumen.cuentas === 1 ? "cuenta" : "cuentas"}</p>
      </div>
      <div className={`rounded-lg border p-4 ${resumen.vencido > 0 ? "border-danger/25 bg-danger-soft/40" : "border-line"}`}>
        <p className="text-sm text-muted">Vencido</p>
        <p className={`text-2xl font-semibold tabular-nums ${resumen.vencido > 0 ? "text-danger" : "text-strong"}`}>{fmtMoneyARS(resumen.vencido)}</p>
      </div>
      <div className={`rounded-lg border p-4 ${resumen.porVencer > 0 ? "border-warning/25 bg-warning-soft/40" : "border-line"}`}>
        <p className="text-sm text-muted">Por vencer</p>
        <p className={`text-2xl font-semibold tabular-nums ${resumen.porVencer > 0 ? "text-warning" : "text-strong"}`}>{fmtMoneyARS(resumen.porVencer)}</p>
      </div>
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm text-muted">Al día</p>
        <p className="text-2xl font-semibold tabular-nums text-strong">{fmtMoneyARS(resumen.alDia)}</p>
      </div>
    </div>
  );
}
