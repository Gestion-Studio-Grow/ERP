import { getClient } from "@/lib/actions";
import { notFound } from "next/navigation";
import Link from "next/link";

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
      <Link href="/admin/clientes" className="text-sm text-neutral-500 hover:underline">
        ← Clientes
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{client.name}</h1>
      <p className="text-neutral-500 mb-6">
        {client.phone} {client.email ? `· ${client.email}` : ""}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-neutral-500">Turnos totales</p>
          <p className="text-2xl font-semibold">{client.appointments.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-neutral-500">Total gastado</p>
          <p className="text-2xl font-semibold">${totalGastado.toLocaleString("es-AR")}</p>
        </div>
      </div>

      <h2 className="text-lg font-medium mb-3">Historial de turnos</h2>
      <div className="space-y-2">
        {client.appointments.map((a) => (
          <div key={a.id} className="rounded-lg border px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.service.name}</span>
              <span className="text-neutral-500">
                {statusLabel[a.status] ?? a.status}
              </span>
            </div>
            <p className="text-neutral-500">
              {a.professional.name} ·{" "}
              {new Date(a.startsAt).toLocaleString("es-AR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        ))}
        {client.appointments.length === 0 && (
          <p className="text-sm text-neutral-500">Este cliente todavía no tiene turnos.</p>
        )}
      </div>
    </main>
  );
}
