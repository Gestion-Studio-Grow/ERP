import { requireApp } from "@/lib/require-app";
import Link from "next/link";
import { EmptyState, Input, Select, buttonClasses } from "@/components/ui";
import { leerFiltros, rangoDeFechas } from "@/lib/eventos-sponsors/core";
import { listarEventos } from "@/lib/eventos-sponsors/repo";
import { abrirEventos, Encabezado, FaltaMigracion, SelloVerificacion } from "./comun";

export const dynamic = "force-dynamic";

// EVENTOS Y SPONSORS · los eventos del negocio filtrados por región y fecha (GSG-CRM-009).
// Filtros en la URL (GET): se pueden compartir y volver atrás sin perderlos.

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export default async function EventosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tenantId, puedeCargar } = await abrirEventos(await requireApp("eventos-sponsors"));
  const filtros = leerFiltros(await searchParams);
  const r = await listarEventos(tenantId, filtros);
  const hayFiltros = !!(filtros.region || filtros.desde || filtros.hasta);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Encabezado vista="eventos" puedeCargar={puedeCargar} />
      {r.faltaMigracion ? (
        <FaltaMigracion />
      ) : (
        <>
          <form method="get" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end" aria-label="Filtrar eventos">
            <div>
              <label htmlFor="f-region" className={ROTULO}>Región</label>
              <Select id="f-region" name="region" defaultValue={filtros.region ?? ""}>
                <option value="">Todas las regiones</option>
                {r.regiones.map((reg) => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="f-desde" className={ROTULO}>Desde</label>
              <Input id="f-desde" name="desde" type="date" defaultValue={filtros.desde ?? ""} />
            </div>
            <div>
              <label htmlFor="f-hasta" className={ROTULO}>Hasta</label>
              <Input id="f-hasta" name="hasta" type="date" defaultValue={filtros.hasta ?? ""} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className={buttonClasses("solid", "md")}>Filtrar</button>
              {hayFiltros && (
                <Link href="/admin/eventos" className={buttonClasses("ghost", "md")}>Limpiar</Link>
              )}
            </div>
          </form>

          {r.eventos.length === 0 ? (
            <EmptyState
              title={hayFiltros ? "No hay eventos con esos filtros" : "Todavía no hay eventos cargados"}
              description={
                hayFiltros
                  ? "Probá con otra región o un rango de fechas más amplio."
                  : puedeCargar
                    ? "Cargá los resultados del equipo de agentes desde «Cargar resultados»."
                    : "Cuando se carguen los resultados del equipo de agentes, los eventos aparecen acá."
              }
              action={!hayFiltros && puedeCargar ? <Link href="/admin/eventos/importar" className={buttonClasses("solid", "md")}>Cargar resultados</Link> : undefined}
            />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted" aria-live="polite">
                {r.eventos.length} {r.eventos.length === 1 ? "evento" : "eventos"}
                {filtros.region ? ` en ${filtros.region}` : ""}
                {r.tope ? " (se muestran los primeros; afiná los filtros)" : ""}
              </p>
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {r.eventos.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/admin/eventos/${e.id}`}
                      className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="w-48 shrink-0 whitespace-nowrap text-sm tabular-nums text-muted">{rangoDeFechas(e.fecha, e.fechaHasta)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-strong">{e.nombre}</span>
                        <span className="block text-sm text-muted">
                          {e.lugar} · {e.region}
                          {e.organizador ? ` · organiza ${e.organizador}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums text-muted">
                        {e.tipo && <span>{e.tipo}</span>}
                        <SelloVerificacion v={e.verificacion} />
                        <span>{e.marcas} {e.marcas === 1 ? "marca" : "marcas"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
