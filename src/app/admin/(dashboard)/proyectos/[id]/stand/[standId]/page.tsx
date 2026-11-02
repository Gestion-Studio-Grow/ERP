import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { standParaEditar, veLaPlata } from "@/lib/proyectos/datos.server";
import { exigirVer, proyectoVisible } from "@/lib/proyectos/gestion.server";
import ArmadorStand from "./ArmadorStand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Armador de stands" };

export default async function PaginaStand({ params }: { params: Promise<{ id: string; standId: string }> }) {
  const user = await requireApp("proyectos");
  const actor = await exigirVer("ficha");
  const { id, standId } = await params;
  if (!(await proyectoVisible(actor, id))) notFound();
  const stand = await standParaEditar(id, standId);
  if (!stand) notFound();
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <header className="mb-4">
        <p className="text-sm text-muted">Proyecto #{stand.proyecto.numero} · {stand.proyecto.client.name}</p>
        <h1 className="text-2xl font-bold text-strong">{stand.proyecto.nombre}: armador de stands</h1>
      </header>
      <ArmadorStand id={stand.id} proyectoId={id} nombreInicial={stand.nombre} disenoInicial={stand.diseno} conPlata={veLaPlata(user)} />
    </main>
  );
}
