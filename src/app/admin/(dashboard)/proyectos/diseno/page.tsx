// La app Diseño: el tablero de tareas, la carga del equipo y el chat del equipo.

import { Pestanas, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { cargaDelEquipo } from "@/lib/proyectos/empresa.server";
import { personasAsignables } from "@/lib/proyectos/diseno.server";
import { exigirVer, filtroDeProyectos, puede } from "@/lib/proyectos/gestion.server";
import { NIVEL_LABEL, type NivelCarga } from "@/lib/proyectos/gestion-core";
import { ChatProyecto } from "../_chat";
import { TableroTareas } from "../_diseno-tablero";
import { aTareaTablero, proyectosElegibles } from "../_pestana-diseno";
import { tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Diseño" };

const TABS = [
  { id: "tablero", label: "Tablero" },
  { id: "carga", label: "Carga de trabajo" },
  { id: "chat", label: "Chat de Diseño" },
];

export default async function AppDiseno({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("diseno");
  const { tab } = await searchParams;
  const actual = TABS.find((t) => t.id === tab)?.id ?? "tablero";
  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5">
      <h1 className="mb-3 text-2xl font-bold text-strong">Diseño</h1>
      <Pestanas etiqueta="Vistas de Diseño" conRaya className="mb-4" pestanas={TABS.map((t) => ({ href: `/admin/proyectos/diseno?tab=${t.id}`, etiqueta: t.label, actual: t.id === actual }))} />
      {actual === "tablero" && <Tablero a={a} />}
      {actual === "carga" && <Carga tenantId={a.tenantId} />}
      {actual === "chat" && <ChatProyecto proyectoId={null} conAdjunto />}
    </main>
  );
}

async function Tablero({ a }: { a: Awaited<ReturnType<typeof exigirVer>> }) {
  const [tareas, proyectos, asignables] = await Promise.all([
    prisma.proyectoTarea.findMany({
      where: { tenantId: a.tenantId, proyecto: { ...filtroDeProyectos(a), perdidoEl: null } },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 500,
      select: { id: true, titulo: true, estado: true, area: true, proyectoId: true, personaId: true, responsable: true, venceEl: true, proyecto: { select: { nombre: true } } },
    }),
    proyectosElegibles(a),
    personasAsignables(a.tenantId),
  ]);
  const hoy = new Date();
  return (
    <TableroTareas
      tareas={tareas.map((t) => aTareaTablero(t, hoy))}
      proyectos={proyectos}
      personas={asignables.personas}
      equipoPorProyecto={asignables.equipoPorProyecto}
      miPersonaId={a.personaId}
      puedeEditar={puede(a, "diseno", "editar")}
    />
  );
}

async function Carga({ tenantId }: { tenantId: string }) {
  const personas = await cargaDelEquipo(tenantId);
  if (personas.length === 0) return <p className="text-sm text-muted">Todavía no hay personas cargadas en el equipo.</p>;
  const tope = Math.max(1, ...personas.map((p) => p.tareas));
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {personas.map((p) => (
        <li key={p.nombre} className={cn(tarjeta, "grid min-w-0 gap-2")}>
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <p className="min-w-0 break-words font-medium text-strong">{p.nombre}{p.puesto && <span className="ml-2 text-sm font-normal text-muted">{p.puesto}</span>}</p>
            <span className="rounded-full border border-line px-2 text-xs font-semibold text-strong">{NIVEL_LABEL[p.nivel as NivelCarga] ?? p.nivel}</span>
          </div>
          <div role="img" aria-label={`${p.tareas} tareas abiertas`} className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(p.tareas / tope) * 100}%` }} />
          </div>
          <p className="text-sm text-muted">{p.proyectos} proyectos · {p.tareas} tareas · {p.semana} esta semana · <span className={cn(p.vencidas > 0 && "font-semibold text-danger")}>{p.vencidas} vencidas</span></p>
        </li>
      ))}
    </ul>
  );
}
