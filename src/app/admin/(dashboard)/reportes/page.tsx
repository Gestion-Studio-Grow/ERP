import { getReportData } from "@/lib/actions";
import { getCommissionsOverview, settleCommissions } from "@/lib/commission-actions";
import { requireUser } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { fmtShortDate } from "@/lib/datetime";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";

export const dynamic = "force-dynamic";

// Feedback de settleCommissions (redirige con ?status=...).
const STATUS_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok_settled: { text: "Comisión liquidada. Quedó registrada en el historial.", ok: true },
  error_nada: { text: "Ese profesional no tiene comisiones pendientes de liquidar.", ok: false },
  error_prof: { text: "No se pudo identificar al profesional.", ok: false },
};

function Table({ title, rows }: { title: string; rows: { label: string; total: number }[] }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <h3 className="font-medium mb-3">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-muted">Sin datos aún.</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between text-sm">
            <span className="text-muted">{r.label}</span>
            <span className="font-medium">${r.total.toLocaleString("es-AR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [data, overview, user, { status }] = await Promise.all([
    getReportData(),
    getCommissionsOverview(),
    requireUser(),
    searchParams,
  ]);
  // Solo el OWNER puede liquidar (marcar pagado); los demás con reports:read
  // ven los montos pero no el botón.
  const canSettle = roleHasCapability(user.role, "commissions:manage");
  const banner = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Reportes</h1>
      <p className="text-muted mb-8">
        Ingresos confirmados (turnos con pago recibido).
      </p>

      {banner && (
        <p
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {banner.text}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Ingresos totales</p>
          <p className="text-2xl font-semibold">
            ${data.totalIngresos.toLocaleString("es-AR")}
          </p>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Turnos pagados</p>
          <p className="text-2xl font-semibold">{data.cantidadPagos}</p>
        </div>
      </div>

      <div className="grid gap-4 mb-8">
        <Table title="Ingresos por día" rows={data.porDia} />
        <Table title="Ingresos por profesional" rows={data.porProfesional} />
        <Table title="Ingresos por servicio" rows={data.porServicio} />
      </div>

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
                  <span className="text-strong">{money(c.amount)}</span>
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
                <form action={settleCommissions} className="flex items-center gap-2 shrink-0">
                  <input type="hidden" name="professionalId" value={c.professionalId} />
                  <input
                    name="note"
                    placeholder="Nota (opcional)"
                    className="w-40 rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
                  />
                  <SubmitButton
                    pendingText="Liquidando…"
                    className={buttonClasses("solid", "sm", "whitespace-nowrap")}
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
              <span className="font-medium whitespace-nowrap">{money(h.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
