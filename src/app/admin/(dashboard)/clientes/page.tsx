import { getClients } from "@/lib/actions";
import ClientsList from "./ClientsList";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await getClients();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-strong mb-1">Clientes</h1>
      <p className="text-muted mb-6">{clients.length} clientes registrados.</p>

      <ClientsList clients={clients} />
    </main>
  );
}
