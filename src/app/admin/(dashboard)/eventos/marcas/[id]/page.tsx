import { requireApp } from "@/lib/require-app";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { rangoDeFechas } from "@/lib/eventos-sponsors/core";
import { fichaMarca } from "@/lib/eventos-sponsors/repo";
import { abrirEventos, Encabezado, etiquetaEdicion, etiquetaRol, FaltaMigracion, LinkFuente, SelloVerificacion } from "../../comun";

export const dynamic = "force-dynamic";

// EVENTOS Y SPONSORS · la vista por marca: en qué eventos está, con su rol y la fuente.

export default async function FichaMarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, puedeCargar } = await abrirEventos(await requireApp("eventos-sponsors"));
  const { id } = await params;
  const r = await fichaMarca(tenantId, id);
  if (r.faltaMigracion) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Encabezado vista="marcas" puedeCargar={puedeCargar} />
        <FaltaMigracion />
      </main>
    );
  }
  const m = r.marca;
  if (!m) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Volver" className="mb-4 text-sm">
        <Link href="/admin/eventos/marcas" className="text-muted underline-offset-2 hover:underline">← Todas las marcas</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-strong">{m.nombre}</h1>
        <p className="mt-1 text-sm text-muted">
          {m.rubro ?? "Rubro sin relevar"}
          {m.web && <> · <LinkFuente url={m.web}>Sitio de la marca</LinkFuente></>}
        </p>
      </header>
      <section aria-labelledby="t-eventos">
        <h2 id="t-eventos" className="mb-3 text-lg font-semibold text-strong">
          Eventos donde está <span className="text-muted tabular-nums">({m.eventos.length})</span>
        </h2>
        {m.eventos.length === 0 ? (
          <EmptyState title="Sin eventos" description="Esta marca no tiene eventos relevados." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {m.eventos.map((p) => (
              <li key={`${p.evento.id}-${p.rol}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-40 shrink-0 text-sm tabular-nums text-muted">{rangoDeFechas(p.evento.fecha, p.evento.fechaHasta)}</span>
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/eventos/${p.evento.id}`} className="font-medium text-strong underline-offset-2 hover:underline">{p.evento.nombre}</Link>
                  <span className="block text-sm text-muted">{[p.evento.lugar, p.evento.region, etiquetaEdicion(p.edicion)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.rol === "SPONSOR_PRINCIPAL" || p.rol === "SPONSOR" ? "accent" : "neutral"}>{etiquetaRol(p.rol)}</Badge>
                  {p.nivel && <Badge tone="info">{p.nivel}</Badge>}
                  <SelloVerificacion v={p.verificacion} />
                </span>
                <span className="text-sm"><LinkFuente url={p.urlFuente} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
