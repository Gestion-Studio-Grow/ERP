import Link from "next/link";
import { getReportData, getDeepReportData } from "@/lib/actions";
import { REPORT_RANGE_DAYS, DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
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
const pct = (n: number) => (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
const hs = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " h";

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "Mercado Pago",
  TRANSFERENCIA: "Transferencia",
};

// Tarjeta de un KPI puntual (número grande + contexto). `tone` tiñe el número
// cuando la métrica tiene lectura buena/mala (ej. no-show alto = danger).
function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-strong";
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dias?: string }>;
}) {
  const { status, dias } = await searchParams;
  // Rango del reporte desde la URL (?dias=), validado contra la lista permitida; si no
  // es válido, cae al default (90d). El rango es obligatorio a nivel de datos (ADR-023 F3).
  const parsedDias = Number(dias);
  const rangeDays = (REPORT_RANGE_DAYS as readonly number[]).includes(parsedDias)
    ? parsedDias
    : DEFAULT_REPORT_RANGE_DAYS;
  const [data, deep, overview, user] = await Promise.all([
    getReportData(rangeDays),
    getDeepReportData(rangeDays),
    getCommissionsOverview(),
    requireUser(),
  ]);
  const k = deep.kpis;
  // Umbral de lectura del no-show: >10% del rubro se considera fuga alta.
  const noShowTone = k.estados.tasaNoShow > 0.1 ? "danger" : "neutral";
  // Solo el OWNER puede liquidar (marcar pagado); los demás con reports:read
  // ven los montos pero no el botón.
  const canSettle = roleHasCapability(user.role, "commissions:manage");
  const banner = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Reportes</h1>
      <p className="text-muted mb-4">
        Ingresos confirmados (turnos con pago recibido) · período{" "}
        {fmtShortDate(data.desde)} a {fmtShortDate(data.hasta)}.
      </p>

      {/* Selector de rango (ADR-023 F3): el reporte se acota a un período, no al histórico. */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Período:</span>
        {REPORT_RANGE_DAYS.map((d) => {
          const active = d === data.rangeDays;
          return (
            <Link
              key={d}
              href={`/admin/reportes?dias=${d}`}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                active
                  ? "border-line-strong bg-surface-raised font-medium text-strong"
                  : "border-line text-muted hover:border-line-strong"
              }`}
            >
              {d === 365 ? "1 año" : `${d} días`}
            </Link>
          );
        })}
        {/* Export CSV del período visible (abre en Excel/Sheets). */}
        <a
          href={`/admin/reportes/export?dias=${data.rangeDays}`}
          className="ml-auto rounded-md border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-line-strong hover:text-strong"
        >
          ↓ Exportar CSV
        </a>
      </div>

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

      {/* KPIs profundos (Reportes v2): fuga operativa, valor por venta, retención,
          productividad. Complementan la facturación bruta de arriba. */}
      <h2 className="text-lg font-semibold mb-1">Indicadores del negocio</h2>
      <p className="text-muted mb-4 text-sm">
        Sobre los {deep.totalTurnos} turnos del período (no solo los cobrados).
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard
          label="No-show"
          value={pct(k.estados.tasaNoShow)}
          hint={`${k.estados.noShow} ausencias sobre ${k.estados.completados + k.estados.noShow} turnos que llegaron a su hora`}
          tone={noShowTone}
        />
        <KpiCard
          label="Cancelación"
          value={pct(k.estados.tasaCancelacion)}
          hint={`${k.estados.cancelados} de ${k.estados.resueltos} turnos resueltos`}
        />
        <KpiCard
          label="Ticket promedio"
          value={money(k.ticketPromedio)}
          hint="Por turno cobrado"
        />
        <KpiCard
          label="Clientes que vuelven"
          value={pct(k.retencion.tasaRecurrencia)}
          hint={`${k.retencion.recurrentes} recurrentes de ${k.retencion.clientesUnicos} en el período`}
          tone={k.retencion.tasaRecurrencia >= 0.3 ? "success" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Rentabilidad hora-silla: cuánto factura cada profesional por hora ocupada. */}
        <div className="rounded-lg border border-line p-4">
          <h3 className="font-medium mb-1">Rentabilidad hora-silla</h3>
          <p className="text-xs text-muted mb-3">
            Ingresos por hora ocupada (turnos completados y cobrados).
          </p>
          {k.rentabilidadHoraSilla.length === 0 && (
            <p className="text-sm text-muted">Sin datos aún.</p>
          )}
          <div className="space-y-1.5">
            {k.rentabilidadHoraSilla.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">{r.label}</span>
                <span className="text-right">
                  <span className="font-medium">{money(r.porHora)}/h</span>
                  <span className="ml-2 text-xs text-muted">
                    {money(r.ingresos)} · {hs(r.horas)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mix de método de pago. */}
        <div className="rounded-lg border border-line p-4">
          <h3 className="font-medium mb-1">Método de pago</h3>
          <p className="text-xs text-muted mb-3">Cómo se cobró en el período.</p>
          {k.mixMetodoPago.length === 0 && (
            <p className="text-sm text-muted">Sin cobros aún.</p>
          )}
          <div className="space-y-1.5">
            {k.mixMetodoPago.map((m) => (
              <div key={m.method} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">
                  {METODO_LABEL[m.method] ?? m.method}
                  <span className="ml-1.5 text-xs">({m.cantidad})</span>
                </span>
                <span className="font-medium">{money(m.total)}</span>
              </div>
            ))}
          </div>
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
