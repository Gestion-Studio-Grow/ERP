import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { standParaEditar } from "@/lib/proyectos/datos.server";
import { exigirVer, proyectoVisible, puede } from "@/lib/proyectos/gestion.server";
import { derivacionTallerPrendido } from "@/cambios/interruptores";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { fechaCorta } from "@/lib/proyectos/core";
import ArmadorStand from "./ArmadorStand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Armador de stands" };

export default async function PaginaStand({ params }: { params: Promise<{ id: string; standId: string }> }) {
  await requireApp("proyectos");
  const actor = await exigirVer("ficha");
  const { id, standId } = await params;
  if (!(await proyectoVisible(actor, id))) notFound();
  const stand = await standParaEditar(id, standId);
  if (!stand) notFound();
  // «¿Quién lo hace?» (GSG-CRM-010): sólo con el interruptor prendido; misma guardia de rol que la página.
  const p = stand.proyecto;
  const fecha = (f: Date | null) => (f ? fechaCorta(f) : null);
  const derivacion = derivacionTallerPrendido(await interruptoresDelNegocio())
    ? { servicio: p.servicio, fechas: { armado: fecha(p.fechaArmado), evento: fecha(p.fechaEvento), desarme: fecha(p.fechaDesarme) } }
    : null;
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <header className="mb-4">
        <p className="text-sm text-muted">Proyecto #{stand.proyecto.numero} · {stand.proyecto.client.name}</p>
        <h1 className="text-2xl font-bold text-strong">{stand.proyecto.nombre}: armador de stands</h1>
      </header>
      <ArmadorStand id={stand.id} proyectoId={id} nombreInicial={stand.nombre} disenoInicial={stand.diseno} conPlata={puede(actor, "costos", "ver")} derivacion={derivacion} />
    </main>
  );
}
