import { requireApp } from "@/lib/require-app";
import { AGENTES, agenteBloqueado } from "@/lib/proyectos/diseno-core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { iaConectada } from "@/lib/proyectos/ia.server";
import { etapa2ActivaPara } from "@/lib/proyectos/etapa2.server";
import { MENSAJE_APAGADO } from "@/lib/proyectos/etapa2-core";
import { consumoDelMes } from "@/lib/proyectos/ia-tope.server";
import { usd } from "@/lib/proyectos/ia-tope-core";
import { FaltaIA } from "../_diseno-avisos";
import { ChatAgentes } from "../_diseno-agentes";
import { proyectosElegibles } from "../_pestana-diseno";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Agentes IA" };

export default async function PaginaAgentes({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  await requireApp("gestion-agentes");
  const a = await exigirVer("ia");
  const { proyecto } = await searchParams;
  const proyectos = await proyectosElegibles(a);
  const activa = await etapa2ActivaPara(a.tenantId, "ia");
  const conectada = iaConectada();
  // El tope lo fija GSG (consola del operador); acá sólo se muestra. null = sin migración o sin poder leer.
  const consumo = activa ? await consumoDelMes(a.tenantId) : null;
  const agentes = AGENTES.map((x) => ({ id: x.id, nombre: x.nombre, ayuda: x.ayuda, sugerencias: x.sugerencias, bloqueado: agenteBloqueado(x.id, (m) => puede(a, m, "ver")) }));
  return (
    <main className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-bold text-strong">Agentes IA</h1>
        <p className="text-sm text-muted">Cada agente ve sólo lo que tu rol puede ver.</p>
        {consumo && (
          <p className="text-sm text-muted">
            IA este mes: {usd(consumo.gastado + consumo.reservado)} de {usd(consumo.tope)}. El tope lo amplía GSG.
          </p>
        )}
      </header>
      {!activa ? (
        <p role="note" className="rounded-xl border border-line bg-surface p-3 text-sm text-strong">{MENSAJE_APAGADO.ia}</p>
      ) : (
        <>
          {!conectada && <FaltaIA mientras="Hasta entonces los agentes no pueden responder: no se muestran respuestas de ejemplo." />}
          <ChatAgentes agentes={agentes} proyectos={proyectos} iaLista={conectada} proyectoInicial={proyectos.some((p) => p.id === proyecto) ? proyecto : undefined} />
        </>
      )}
    </main>
  );
}
