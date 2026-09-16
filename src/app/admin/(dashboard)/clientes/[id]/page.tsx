import { getClient } from "@/lib/actions";
import { fmtMoneyARS } from "@/components/ui";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fmtDateTime } from "@/lib/datetime";
import { canCurrentUser } from "@/lib/authz";
import EditarClienteForm from "./EditarClienteForm";

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

  // `clients:manage` está otorgada a RECEPTION y hasta acá no la consumía nadie. Esto es
  // sólo para no mostrar un botón que no va a funcionar; la guarda de verdad está en
  // `updateClient` (ADR-017 §2.e: ocultar un botón no es seguridad).
  const puedeEditar = await canCurrentUser("clients:manage");

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
            {client.isResident ? "Cliente de la zona (precio local)" : "Sin precio local"}
          </span>
        )}
      </p>

      {puedeEditar && (
        <div className="mb-8">
          <EditarClienteForm
            cliente={{
              id: client.id,
              name: client.name,
              phone: client.phone,
              email: client.email,
              notes: client.notes,
              // `<input type="date">` sólo entiende "yyyy-mm-dd". La fecha se guarda a las
              // 12:00Z justamente para que este recorte dé el mismo día en cualquier huso.
              birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : null,
            }}
          />
        </div>
      )}

      {client.notes && (
        <div className="mb-8 rounded-lg border border-line bg-surface-raised p-4">
          <p className="text-sm font-medium text-strong mb-1">Notas internas</p>
          <p className="text-sm text-muted whitespace-pre-line">{client.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4">
          <p className="text-sm text-muted">Turnos totales</p>
          <p className="text-2xl font-semibold text-strong">{client.appointments.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4">
          <p className="text-sm text-muted">Total gastado</p>
          <p className="text-2xl font-semibold text-strong">{fmtMoneyARS(totalGastado, 0)}</p>
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
