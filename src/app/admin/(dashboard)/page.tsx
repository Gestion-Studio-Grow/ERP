import { getDashboardData } from "@/lib/actions";
import Link from "next/link";

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
  const data = await getDashboardData();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-neutral-500 mb-8">Resumen del día.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-10">
        <Kpi label="Turnos hoy" value={String(data.todayAppointments.length)} />
        <Kpi label="Pendientes" value={String(data.pendingCount)} href="/admin/turnos" />
        <Kpi
          label="Ingresos 7 días"
          value={`$${data.weekRevenue.toLocaleString("es-AR")}`}
          href="/admin/reportes"
        />
        <Kpi label="Clientes" value={String(data.clientsCount)} href="/admin/clientes" />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Agenda de hoy</h2>
        {data.todayAppointments.length === 0 && (
          <p className="text-sm text-neutral-500">No hay turnos programados para hoy.</p>
        )}
        <div className="space-y-2">
          {data.todayAppointments.map((a) => (
            <div key={a.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
              <span className="font-medium">
                {new Date(a.startsAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-neutral-600 flex-1 px-4">
                {a.client.name} — {a.service.name}
              </span>
              <span className="text-neutral-500">{a.professional.name}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
