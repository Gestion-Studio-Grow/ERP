import { getDashboardData } from "@/lib/actions";
import Link from "next/link";
import { fmtTime } from "@/lib/datetime";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

function Kpi({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-lg border p-3 sm:p-4 hover:border-neutral-400 transition-colors">
      <p className="text-xs sm:text-sm text-neutral-500 leading-tight">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default async function DashboardPage() {
  const user = await requireCapability("dashboard:read");
  // Ingresos = dato financiero: solo quien puede ver reportes (OWNER). La
  // recepción ve el resto del dashboard sin la cifra de facturación.
  const canSeeRevenue = roleHasCapability(user.role, "reports:read");
  const data = await getDashboardData();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
          <p className="text-neutral-500">Resumen del día.</p>
        </div>
        {/* Acceso directo a la tarea más frecuente (llamada / walk-in) sin
            tener que navegar primero a la Agenda. */}
        <Link
          href="/admin/turnos"
          className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium whitespace-nowrap"
        >
          + Nuevo turno
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-10">
        <Kpi label="Turnos hoy" value={String(data.todayAppointments.length)} href="/admin/turnos" />
        <Kpi label="Pendientes" value={String(data.pendingCount)} href="/admin/turnos" />
        {canSeeRevenue && (
          <Kpi
            label="Ingresos 7 días"
            value={`$${data.weekRevenue.toLocaleString("es-AR")}`}
            href="/admin/reportes"
          />
        )}
        <Kpi label="Clientes" value={String(data.clientsCount)} href="/admin/clientes" />
      </div>

      {data.blocksToday.length > 0 && (
        <div className="mb-6 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Hoy no está: </span>
          {data.blocksToday.map((b, i) => (
            <span key={i}>
              {b.professional.name} ({b.reason})
              {i < data.blocksToday.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">Agenda de hoy</h2>
        {data.todayAppointments.length === 0 && (
          <p className="text-sm text-neutral-500">No hay turnos programados para hoy.</p>
        )}
        <div className="space-y-2">
          {data.todayAppointments.map((a) => (
            <Link
              key={a.id}
              href="/admin/turnos"
              className="rounded-lg border p-3 flex items-center justify-between text-sm hover:border-neutral-400 transition-colors"
            >
              <span className="font-medium">{fmtTime(a.startsAt)}</span>
              <span className="text-neutral-600 flex-1 px-4">
                {a.client.name} — {a.service.name}
              </span>
              <span className="text-neutral-500">{a.professional.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
