// Propuesta con IA: tres pasos sobre un proyecto anterior a Confirmado. El concepto puede usar la IA o escribirse a mano; las imágenes salen del
// Estudio; la presentación se arma con reglas.

import Link from "next/link";
import { Pestanas, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { etapaLabel } from "@/lib/proyectos/core";
import { ETAPAS_PROPUESTA, PASOS_PROPUESTA } from "@/lib/proyectos/diseno-core";
import { exigirVer, filtroDeProyectos, puede } from "@/lib/proyectos/gestion.server";
import { codigoProyecto } from "@/lib/proyectos/gestion-core";
import { PanelEstudio, PanelIdea, PanelPresentaciones } from "../_pestana-diseno";
import { tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Propuesta con IA" };

export default async function PaginaPropuesta({ searchParams }: { searchParams: Promise<{ proyecto?: string; paso?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("ia");
  const { proyecto, paso } = await searchParams;
  if (!puede(a, "diseno", "ver")) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-5">
        <h1 className="mb-2 text-2xl font-bold text-strong">Propuesta con IA</h1>
        <p className="text-sm text-muted">La propuesta se arma desde Diseño, y tu rol no ve Diseño.</p>
      </main>
    );
  }
  const proyectos = await prisma.proyecto.findMany({
    where: { ...filtroDeProyectos(a), perdidoEl: null, etapa: { in: [...ETAPAS_PROPUESTA] } },
    orderBy: [{ fechaEvento: { sort: "asc", nulls: "last" } }, { numero: "desc" }],
    take: 100,
    select: { id: true, numero: true, createdAt: true, nombre: true, etapa: true, servicio: true, client: { select: { name: true } } },
  });
  const elegido = proyectos.find((p) => p.id === proyecto);
  const actual = PASOS_PROPUESTA.find((p) => p.id === paso)?.id ?? "concepto";
  return (
    <main className="mx-auto grid w-full min-w-0 max-w-5xl gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-bold text-strong">Propuesta con IA</h1>
        <p className="text-sm text-muted">Concepto, imágenes y presentación para un proyecto que todavía no está confirmado.</p>
      </header>

      {proyectos.length === 0 && <p className={cn(tarjeta, "text-sm text-muted")}>No hay proyectos en etapas previas a Confirmado.</p>}
      {proyectos.length > 0 && (
        <nav aria-label="Elegir proyecto">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {proyectos.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/proyectos/propuesta-ia?proyecto=${p.id}`} aria-current={p.id === elegido?.id ? "page" : undefined} className={cn(tarjeta, "grid min-h-11 min-w-0 gap-0.5 p-3", p.id === elegido?.id && "border-accent")}>
                  <span className="text-xs text-muted">{codigoProyecto(p.numero, p.createdAt)} · {etapaLabel(p.etapa, p.servicio)}</span>
                  <span className="break-words text-sm font-medium text-strong">{p.nombre}</span>
                  <span className="break-words text-xs text-muted">{p.client.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {elegido ? (
        <section className="grid min-w-0 gap-4" aria-label={`Propuesta de ${elegido.nombre}`}>
          <Pestanas
            etiqueta="Pasos de la propuesta"
            conRaya
            pestanas={PASOS_PROPUESTA.map((p, i) => ({ href: `/admin/proyectos/propuesta-ia?proyecto=${elegido.id}&paso=${p.id}`, etiqueta: `${i + 1}. ${p.label}`, actual: p.id === actual }))}
          />
          {actual === "concepto" && <PanelIdea a={a} proyectoId={elegido.id} mostrarPedido />}
          {actual === "imagenes" && <PanelEstudio a={a} proyectoId={elegido.id} />}
          {actual === "presentacion" && <PanelPresentaciones a={a} proyectoId={elegido.id} />}
        </section>
      ) : (
        proyectos.length > 0 && <p className="text-sm text-muted">Elegí un proyecto para empezar.</p>
      )}
    </main>
  );
}
