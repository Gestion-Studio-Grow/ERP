import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { etapaLabel, fechaCorta } from "@/lib/proyectos/core";
import { codigoProyecto } from "@/lib/proyectos/gestion-core";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { buscarEnGestion } from "@/lib/proyectos/gestion-lecturas.server";
import { campo, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar" };

function Grupo({ titulo, cantidad, children }: { titulo: string; cantidad: number; children: ReactNode }) {
  if (cantidad === 0) return null;
  return (
    <section className={tarjeta} aria-label={titulo}>
      <h2 className="mb-1 font-semibold text-strong">{titulo} <span className="text-sm font-normal text-muted">({cantidad})</span></h2>
      <ul className="grid">{children}</ul>
    </section>
  );
}

const fila = "block min-h-11 border-t border-line py-2 text-sm hover:bg-surface";

export default async function BuscarGestion({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const { q: pedido } = await searchParams;
  const { q, proyectos, proveedores, archivos, mensajes } = await buscarEnGestion(a, pedido ?? "");
  const total = proyectos.length + proveedores.length + archivos.length + mensajes.length;

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-5">
      <h1 className="text-2xl font-bold text-strong">Buscar</h1>
      <form method="get" role="search" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input name="q" defaultValue={q} aria-label="Buscar proyectos, proveedores, archivos y mensajes" placeholder="Proyectos, proveedores, archivos, mensajes" className={campo} />
        <button type="submit" className={buttonClasses("solid", "md")}>Buscar</button>
      </form>
      {q.length < 2 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Escribí al menos dos letras.</p>
      ) : total === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>No encontré nada con «{q}» entre lo que podés ver.</p>
      ) : (
        <p className="text-sm text-muted" aria-live="polite">{total === 1 ? "1 resultado" : `${total} resultados`} para «{q}»</p>
      )}
      <Grupo titulo="Proyectos" cantidad={proyectos.length}>
        {proyectos.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/proyectos/${p.id}`} className={fila}>
              <span className="block break-words font-medium text-strong">{codigoProyecto(p.numero, p.createdAt)} · {p.nombre}</span>
              <span className="block text-xs text-muted">{[p.client.name, p.ciudad, etapaLabel(p.etapa, p.servicio)].filter(Boolean).join(" · ")}</span>
            </Link>
          </li>
        ))}
      </Grupo>
      <Grupo titulo="Proveedores" cantidad={proveedores.length}>
        {proveedores.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/proyectos/proveedores/${s.id}`} className={fila}>
              <span className="block break-words font-medium text-strong">{s.name}{!s.active && " (de baja)"}</span>
              <span className="block text-xs text-muted">{[s.fichaDeProyecto?.rubro, s.fichaDeProyecto?.ciudad].filter(Boolean).join(" · ") || "Sin rubro"}</span>
            </Link>
          </li>
        ))}
      </Grupo>
      <Grupo titulo="Archivos" cantidad={archivos.length}>
        {archivos.map((x) => (
          <li key={x.id}>
            <Link href={`/admin/proyectos/${x.proyectoId}?tab=archivos`} className={fila}>
              <span className="block break-words font-medium text-strong">{x.nombre}</span>
              <span className="block text-xs text-muted">{x.proyecto.nombre} · {x.tipo.toLowerCase()}</span>
            </Link>
          </li>
        ))}
      </Grupo>
      <Grupo titulo="Mensajes" cantidad={mensajes.length}>
        {mensajes.map((m) => (
          <li key={m.id}>
            <Link href={m.proyectoId ? `/admin/proyectos/${m.proyectoId}?tab=chat` : "/admin/proyectos/diseno?tab=chat"} className={fila}>
              <span className="block break-words text-strong">{m.texto}</span>
              <span className="block text-xs text-muted">{[m.autor, m.proyecto?.nombre ?? "Chat de Diseño", `#${m.canal}`, fechaCorta(m.createdAt)].join(" · ")}</span>
            </Link>
          </li>
        ))}
      </Grupo>
    </main>
  );
}
