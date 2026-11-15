import { requireApp } from "@/lib/require-app";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { rangoDeFechas } from "@/lib/eventos-sponsors/core";
import { fichaEvento } from "@/lib/eventos-sponsors/repo";
import { abrirEventos, Encabezado, etiquetaEdicion, etiquetaRol, FaltaMigracion, LinkFuente, Registro, SelloVerificacion } from "../comun";

export const dynamic = "force-dynamic";

// EVENTOS Y SPONSORS · la ficha de un evento con sus marcas y el link a la fuente de cada una.
// Un id de otro negocio da 404 (RLS + tenantId en la consulta).

export default async function FichaEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, puedeCargar } = await abrirEventos(await requireApp("eventos-sponsors"));
  const { id } = await params;
  const r = await fichaEvento(tenantId, id);
  if (r.faltaMigracion) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Encabezado vista="eventos" puedeCargar={puedeCargar} />
        <FaltaMigracion />
      </main>
    );
  }
  const e = r.evento;
  if (!e) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Volver" className="mb-4 text-sm">
        <Link href="/admin/eventos" className="text-muted underline-offset-2 hover:underline">← Todos los eventos</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-strong">{e.nombre}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <SelloVerificacion v={e.verificacion} />
          {e.tipo && <Badge tone="neutral">{e.tipo}</Badge>}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">Fecha: </dt><dd className="inline">{rangoDeFechas(e.fecha, e.fechaHasta)}</dd></div>
          <div><dt className="inline text-muted">Lugar: </dt><dd className="inline">{e.lugar}</dd></div>
          <div><dt className="inline text-muted">Región: </dt><dd className="inline">{e.region}</dd></div>
          {e.organizador && <div><dt className="inline text-muted">Organiza: </dt><dd className="inline">{e.organizador}</dd></div>}
          {e.urlFuente && <div className="sm:col-span-2"><dt className="inline text-muted">Fuente del evento: </dt><dd className="inline"><LinkFuente url={e.urlFuente}>Sitio del evento</LinkFuente></dd></div>}
        </dl>
        <Registro lineas={e.registro} titulo="Qué hizo el equipo con este evento" />
      </header>

      <section aria-labelledby="t-marcas">
        <h2 id="t-marcas" className="mb-3 text-lg font-semibold text-strong">
          Marcas en este evento <span className="text-muted tabular-nums">({e.marcas.length})</span>
        </h2>
        {e.marcas.length === 0 ? (
          <EmptyState title="Sin marcas relevadas" description="El equipo de agentes todavía no encontró sponsors ni expositores de este evento." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {e.marcas.map((m) => (
              <li key={`${m.marcaId}-${m.rol}`} className="px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <Link href={`/admin/eventos/marcas/${m.marcaId}`} className="font-medium text-strong underline-offset-2 hover:underline">{m.nombre}</Link>
                    {(m.rubro || m.edicion) && <span className="block text-sm text-muted">{[m.rubro, etiquetaEdicion(m.edicion)].filter(Boolean).join(" · ")}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.rol === "SPONSOR_PRINCIPAL" || m.rol === "SPONSOR" ? "accent" : "neutral"}>{etiquetaRol(m.rol)}</Badge>
                    {m.nivel && <Badge tone="info">{m.nivel}</Badge>}
                    <SelloVerificacion v={m.verificacion} />
                  </span>
                  <span className="text-sm"><LinkFuente url={m.urlFuente} /></span>
                </div>
                <Registro lineas={m.registro} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
