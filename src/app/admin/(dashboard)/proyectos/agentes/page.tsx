import { requireApp } from "@/lib/require-app";
import { AGENTES, agenteBloqueado } from "@/lib/proyectos/diseno-core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { iaConectada } from "@/lib/proyectos/ia.server";
import { FaltaIA } from "../_diseno-avisos";
import { ChatAgentes } from "../_diseno-agentes";
import { proyectosElegibles } from "../_pestana-diseno";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Agentes IA" };

export default async function PaginaAgentes({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("ia");
  const { proyecto } = await searchParams;
  const proyectos = await proyectosElegibles(a);
  const conectada = iaConectada();
  const agentes = AGENTES.map((x) => ({ id: x.id, nombre: x.nombre, ayuda: x.ayuda, sugerencias: x.sugerencias, bloqueado: agenteBloqueado(x.id, (m) => puede(a, m, "ver")) }));
  return (
    <main className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-bold text-strong">Agentes IA</h1>
        <p className="text-sm text-muted">Cada agente ve sólo lo que tu rol puede ver.</p>
      </header>
      {!conectada && <FaltaIA mientras="Hasta entonces los agentes no pueden responder: no se muestran respuestas de ejemplo." />}
      <ChatAgentes agentes={agentes} proyectos={proyectos} iaLista={conectada} proyectoInicial={proyectos.some((p) => p.id === proyecto) ? proyecto : undefined} />
    </main>
  );
}
