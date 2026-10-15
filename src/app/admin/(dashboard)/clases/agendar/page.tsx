import { requireApp } from "@/lib/require-app";
import { alumnos, badgePendientes } from "@/lib/padel/datos.server";
import { todayInBusinessTz } from "@/lib/datetime";
import { BarraClases } from "../_vista";
import AgendarForm from "./AgendarForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Agendar", manifest: "/clases/app.webmanifest" };

// Agendar a mano: lo que le pidieron en la cancha. Nace confirmada (la decidió el profe).
export default async function ClasesAgendar() {
  await requireApp("padel-clases");
  const [lista, numero] = await Promise.all([alumnos(), badgePendientes()]);
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-5">
      <h1 className="mb-1 text-2xl font-bold text-strong">Agendar clase</h1>
      <p className="mb-4 text-sm text-muted">Para lo que te piden en la cancha. Queda confirmada y le avisás por WhatsApp.</p>
      <BarraClases activa="" pendientes={numero} />
      <AgendarForm alumnos={lista.map((a) => ({ id: a.id, nombre: a.nombre }))} hoy={todayInBusinessTz()} />
    </main>
  );
}
