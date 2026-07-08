import { getDashboardData } from "@/lib/actions";
import Link from "next/link";
import { fmtTime } from "@/lib/datetime";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getActiveProfile } from "@/lib/profile-gating";
import { buttonClasses, KpiTile } from "@/components/ui";

export const dynamic = "force-dynamic";

// Set chico de íconos de línea para los KPI (dirección B). currentColor → toman
// el acento del tenant dentro del chip que arma KpiTile (ADR-059 D6).
const KPI_ICONS: Record<string, React.ReactNode> = {
  agenda: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18" /></>),
  reloj: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  barras: (<path d="M5 20V10M12 20V4M19 20v-7" />),
  cliente: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>),
};

function KpiIcon({ name }: { name: keyof typeof KPI_ICONS }) {
  return (
    <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {KPI_ICONS[name]}
    </svg>
  );
}

// Envoltorio local: el tile en sí vive en `KpiTile` (design system, D6) —
// acá solo queda lo propio de esta página (qué ícono, a qué ruta linkea).
function Kpi({ label, value, href, icon, sub }: { label: string; value: string; href?: string; icon: keyof typeof KPI_ICONS; sub?: string }) {
  const tile = <KpiTile label={label} value={value} icon={<KpiIcon name={icon} />} sub={sub} />;
  return href ? <Link href={href} className="block h-full">{tile}</Link> : tile;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendiente", cls: "bg-warning-soft text-warning" },
  CONFIRMED: { label: "Confirmado", cls: "bg-success-soft text-success" },
  COMPLETED: { label: "Completado", cls: "bg-info-soft text-info" },
  NO_SHOW: { label: "No vino", cls: "bg-danger-soft text-danger" },
};

function StatusBadge({ status }: { status?: string }) {
  const b = (status && STATUS_BADGE[status]) || null;
  if (!b) return null;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>;
}

export default async function DashboardPage() {
  const user = await requireCapability("dashboard:read");
  // Ingresos = dato financiero: solo quien puede ver reportes (OWNER). La
  // recepción ve el resto del dashboard sin la cifra de facturación.
  const canSeeRevenue = roleHasCapability(user.role, "reports:read");
  // Home ANALÍTICO por rol (ADR-059 D8, P1.c del set Empresa): el tenant perfil
  // "Empresa" con rol de visión financiera (OWNER) ve un panel analítico/ejecutivo
  // —lidera lo financiero + un indicador derivado—; el Comercio y los roles
  // operativos ven el home de UNA acción (resumen del día). Es un RE-LAYOUT sobre
  // los MISMOS datos (`getDashboardData`): no hay módulo ni consulta nueva, no toca
  // Neon. Con el motor de perfiles OFF (`profile===null`, default) es byte-idéntico
  // al home de hoy → default-off-identical. El naming al cliente (badge "Empresa")
  // lo pone el shell en canal neutro (ADR-059 D5/D7).
  const profile = await getActiveProfile();
  const analytical = profile === "enterprise" && canSeeRevenue;
  const data = await getDashboardData();

  const confirmedToday = data.todayAppointments.filter((a) => a.status === "CONFIRMED").length;
  const confirmedPct =
    data.todayAppointments.length > 0
      ? `${Math.round((confirmedToday / data.todayAppointments.length) * 100)}%`
      : "—";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-strong tracking-tight mb-1">Dashboard</h1>
          <p className="text-muted text-sm">
            {analytical ? "Vista analítica del negocio." : "Resumen del día."}
          </p>
        </div>
        {/* Home de una acción (Comercio): el atajo a la tarea más frecuente es el
            héroe (botón sólido). Home analítico (Empresa): la acción cede el
            protagonismo a los indicadores → botón secundario (ADR-059 D8). */}
        <Link
          href="/admin/turnos"
          className={buttonClasses(analytical ? "outline" : "solid", "sm", "whitespace-nowrap")}
        >
          + Nuevo turno
        </Link>
      </div>

      {analytical ? (
        // Panel analítico Empresa: lidera lo financiero + un indicador derivado
        // (% de confirmación de hoy), sobre los mismos datos del día.
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi label="Ingresos 7 días" value={`$${data.weekRevenue.toLocaleString("es-AR")}`} href="/admin/reportes" icon="barras" sub="ver rentabilidad" />
          <Kpi label="Confirmación hoy" value={confirmedPct} href="/admin/turnos" icon="reloj"
            sub={data.todayAppointments.length > 0 ? `${confirmedToday} de ${data.todayAppointments.length} turnos` : undefined} />
          <Kpi label="Turnos hoy" value={String(data.todayAppointments.length)} href="/admin/turnos" icon="agenda" />
          <Kpi label="Clientes" value={String(data.clientsCount)} href="/admin/clientes" icon="cliente" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi label="Turnos hoy" value={String(data.todayAppointments.length)} href="/admin/turnos" icon="agenda"
            sub={data.todayAppointments.length > 0 ? `${confirmedToday} confirmados` : undefined} />
          <Kpi label="Pendientes" value={String(data.pendingCount)} href="/admin/turnos" icon="reloj"
            sub={data.pendingCount > 0 ? "a confirmar pago" : undefined} />
          {canSeeRevenue && (
            <Kpi
              label="Ingresos 7 días"
              value={`$${data.weekRevenue.toLocaleString("es-AR")}`}
              href="/admin/reportes"
              icon="barras"
            />
          )}
          <Kpi label="Clientes" value={String(data.clientsCount)} href="/admin/clientes" icon="cliente" />
        </div>
      )}

      {data.blocksToday.length > 0 && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg bg-warning-soft border border-warning/25 px-4 py-2.5 text-sm text-warning">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 9v4M12 16h.01" /></svg>
          <span>
            <span className="font-semibold">Hoy no está: </span>
            {data.blocksToday.map((b, i) => (
              <span key={i}>
                {b.professional.name} ({b.reason})
                {i < data.blocksToday.length - 1 ? " · " : ""}
              </span>
            ))}
          </span>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface-raised shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h2 className="text-[15px] font-semibold text-strong">Agenda de hoy</h2>
          <Link href="/admin/turnos" className="text-[13px] font-medium text-accent hover:underline">Ver agenda completa →</Link>
        </div>
        {data.todayAppointments.length === 0 && (
          <p className="text-sm text-muted px-5 py-6">No hay turnos programados para hoy.</p>
        )}
        {data.todayAppointments.map((a, i) => (
          <Link
            key={a.id}
            href="/admin/turnos"
            className={`flex items-center gap-4 px-5 py-3.5 text-sm hover:bg-surface-sunken transition-colors ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="font-semibold text-accent text-xs bg-accent-soft rounded-md px-2 py-1 min-w-[62px] text-center">{fmtTime(a.startsAt)}</span>
            <span className="flex-1 min-w-0">
              <span className="font-semibold text-strong">{a.client.name}</span>
              <span className="text-muted"> — {a.service.name}</span>
            </span>
            <StatusBadge status={(a as { status?: string }).status} />
            <span className="text-muted text-[13px] whitespace-nowrap">{a.professional.name}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
