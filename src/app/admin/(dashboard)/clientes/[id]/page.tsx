import { getClient } from "@/lib/actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fmtDateTime } from "@/lib/datetime";

const statusLabel: Record<string, string> = {
  PENDING: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const totalGastado = client.appointments
    .filter((a) => a.payment?.status === "APPROVED")
    .reduce((sum, a) => sum + (a.payment?.amount ?? 0), 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/admin/clientes" className="text-sm text-muted hover:text-strong hover:underline">
        ← Clientes
      </Link>
      <h1 className="text-2xl font-semibold text-strong mt-2 mb-1">{client.name}</h1>
      <p className="text-muted mb-6 flex flex-wrap items-center gap-2">
        <span>
          {client.phone} {client.email ? `· ${client.email}` : ""}
        </span>
        {client.isResident != null && (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              client.isResident ? "bg-accent-soft text-accent" : "bg-surface-sunken text-muted"
            }`}
          >
            {client.isResident ? "Vecino/a de La Alameda" : "No es vecino/a de La Alameda"}
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4">
          <p className="text-sm text-muted">Turnos totales</p>
          <p className="text-2xl font-semibold text-strong">{client.appointments.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4">
          <p className="text-sm text-muted">Total gastado</p>
          <p className="text-2xl font-semibold text-strong">${totalGastado.toLocaleString("es-AR")}</p>
        </div>
      </div>

      <h2 className="text-lg font-medium text-strong mb-3">Historial de turnos</h2>
      <div className="space-y-2">
        {client.appointments.map((a) => (
          <div key={a.id} className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-strong">{a.service.name}</span>
              <span className="text-muted">
                {statusLabel[a.status] ?? a.status}
              </span>
            </div>
            <p className="text-muted">
              {a.professional.name} · {fmtDateTime(a.startsAt)}
            </p>
          </div>
        ))}
        {client.appointments.length === 0 && (
          <p className="text-sm text-muted">Este cliente todavía no tiene turnos.</p>
        )}
      </div>
    </main>
  );
}
