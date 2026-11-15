import { requireApp } from "@/lib/require-app";
import Link from "next/link";
import { EmptyState, Input, buttonClasses } from "@/components/ui";
import { listarMarcas } from "@/lib/eventos-sponsors/repo";
import { abrirEventos, Encabezado, FaltaMigracion } from "../comun";

export const dynamic = "force-dynamic";

// EVENTOS Y SPONSORS · las marcas relevadas y en cuántos eventos aparece cada una.

export default async function MarcasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tenantId, puedeCargar } = await abrirEventos(await requireApp("eventos-sponsors"));
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() && sp.q.length <= 120 ? sp.q.trim() : null;
  const r = await listarMarcas(tenantId, q);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Encabezado vista="marcas" puedeCargar={puedeCargar} descripcion="Cada marca y los eventos donde aparece: quién auspicia qué." />
      {r.faltaMigracion ? (
        <FaltaMigracion />
      ) : (
        <>
          <form method="get" role="search" className="mb-6 flex gap-2" aria-label="Buscar marca">
            <label htmlFor="q" className="sr-only">Buscar marca</label>
            <Input id="q" name="q" type="search" placeholder="Buscar marca…" defaultValue={q ?? ""} className="flex-1" />
            <button type="submit" className={buttonClasses("solid", "md")}>Buscar</button>
          </form>
          {r.marcas.length === 0 ? (
            <EmptyState title={q ? `No hay marcas que coincidan con «${q}»` : "Todavía no hay marcas cargadas"} description="Las marcas aparecen al cargar los resultados del equipo de agentes." />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {r.marcas.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/eventos/marcas/${m.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-strong">{m.nombre}</span>
                      {m.rubro && <span className="block text-sm text-muted">{m.rubro}</span>}
                    </span>
                    <span className="text-sm tabular-nums text-muted">
                      {m.eventos} {m.eventos === 1 ? "evento" : "eventos"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
