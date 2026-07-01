import { getClients } from "@/lib/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await getClients();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Clientes</h1>
      <p className="text-neutral-500 mb-8">{clients.length} clientes registrados.</p>

      <div className="space-y-2">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clientes/${c.id}`}
            className="flex items-center justify-between rounded-lg border px-4 py-3 hover:border-neutral-400 transition-colors"
          >
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-neutral-500">{c.phone}</p>
            </div>
            <span className="text-sm text-neutral-500">
              {c.appointments.length} turno{c.appointments.length !== 1 ? "s" : ""}
            </span>
          </Link>
        ))}
        {clients.length === 0 && (
          <p className="text-sm text-neutral-500">
            Todavía no hay clientes. Se cargan automáticamente cuando reservan un turno.
          </p>
        )}
      </div>
    </main>
  );
}
