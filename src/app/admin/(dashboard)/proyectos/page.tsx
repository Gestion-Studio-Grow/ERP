import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { tableroProyectos } from "@/lib/proyectos/datos.server";
import { ETAPAS, etapaLabel, fechaCorta, resumenEntregables, SERVICIO_LABEL, yaVencio, type Servicio } from "@/lib/proyectos/core";
import { BarraProyectos, tarjeta } from "./_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proyectos" };

export default async function TableroProyectos() {
  await requireApp("proyectos");
  const { proyectos, conPlata } = await tableroProyectos();
  const abiertos = proyectos.filter((p) => p.etapa !== "CIERRE");
  const cerrados = proyectos.length - abiertos.length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Proyectos</h1>
          <p className="text-sm text-muted">
            {abiertos.length === 0 ? "No hay trabajos abiertos." : `${abiertos.length} trabajo${abiertos.length > 1 ? "s" : ""} abierto${abiertos.length > 1 ? "s" : ""}`}
            {cerrados > 0 && ` · ${cerrados} cerrado${cerrados > 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/admin/proyectos/nuevo" className={cn(buttonClasses("solid", "lg"), "w-full justify-center sm:w-auto")}>+ Nuevo proyecto</Link>
      </header>

      <BarraProyectos activa="/admin/proyectos" conPlata={conPlata} />

      {proyectos.length === 0 ? (
        <EmptyState title="Todavía no hay proyectos" description="Cargá el primer pedido de un cliente para empezar." />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {ETAPAS.map((etapa) => {
            const lista = proyectos.filter((p) => p.etapa === etapa);
            if (lista.length === 0) return null;
            return (
              <section key={etapa} aria-label={etapaLabel(etapa)}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{etapaLabel(etapa)} · {lista.length}</h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {lista.map((p) => {
                    const vencidas = p.tareas.filter((t) => yaVencio(t.venceEl)).length;
                    const piezas = resumenEntregables(p.entregables);
                    return (
                      <li key={p.id}>
                        <Link href={`/admin/proyectos/${p.id}`} className={cn(tarjeta, "block h-full hover:border-accent")}>
                          <p className="text-xs text-muted">#{p.numero} · {SERVICIO_LABEL[p.servicio as Servicio] ?? p.servicio}</p>
                          <p className="mt-1 font-semibold text-strong">{p.nombre}</p>
                          <p className="text-sm">{p.client.name}</p>
                          <p className="mt-2 text-sm text-muted">
                            {p.fechaEvento ? `Evento: ${fechaCorta(p.fechaEvento)}` : "Sin fecha de evento"}
                            {p.tareas.length > 0 && ` · ${p.tareas.length} tarea${p.tareas.length > 1 ? "s" : ""}`}
                          </p>
                          {vencidas > 0 && <p className="mt-1 text-sm font-medium text-danger">{vencidas} tarea{vencidas > 1 ? "s" : ""} vencida{vencidas > 1 ? "s" : ""}</p>}
                          {piezas.paraCorregir > 0 && <p className="mt-1 text-sm font-medium text-danger">{piezas.paraCorregir} pieza{piezas.paraCorregir > 1 ? "s" : ""} para corregir</p>}
                          {piezas.esperando > 0 && <p className="mt-1 text-sm text-muted">{piezas.esperando} pieza{piezas.esperando > 1 ? "s" : ""} esperando al cliente</p>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
