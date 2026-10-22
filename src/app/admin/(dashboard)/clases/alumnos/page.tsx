import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { EmptyState, cn } from "@/components/ui";
import { alumnos, badgePendientes } from "@/lib/padel/datos.server";
import { diaHumano, linkWhatsApp, pesos } from "@/lib/padel/core";
import { BarraClases, tarjeta } from "../_vista";
import { BotonDevolver, BotonLink, BotonRegenerarLink } from "../_acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Alumnos", manifest: "/clases/app.webmanifest" };

// Los alumnos: quién debe, cuándo vino por última vez, su link y su WhatsApp. Se dan de alta
// solos al pedir clase (o el profe al agendar): acá no hay formulario de alta.
export default async function ClasesAlumnos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireApp("padel-clases");
  const { q = "" } = await searchParams;
  const [lista, numero] = await Promise.all([alumnos(q), badgePendientes()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="mb-1 text-2xl font-bold text-strong">Alumnos</h1>
      <p className="mb-4 text-sm text-muted">Se suman solos cuando piden clase desde tu link.</p>
      <BarraClases activa="/admin/clases/alumnos" pendientes={numero} />

      <form className="mb-4" role="search">
        <label htmlFor="buscar-alumno" className="sr-only">Buscar alumno</label>
        <input
          id="buscar-alumno"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o celular"
          className="h-12 w-full rounded-xl border border-line bg-surface-raised px-4 text-base text-strong"
        />
      </form>

      {lista.length === 0 ? (
        <EmptyState title={q ? "No encontramos a nadie con eso" : "Todavía no hay alumnos"} description="Compartí tu link del turnero en la bio de Instagram." />
      ) : (
        <ul className="grid gap-2">
          {lista.map((a) => {
            const wa = linkWhatsApp(a.telefono, "");
            return (
              <li key={a.id} className={cn(tarjeta, "grid gap-2")} data-qa="alumno">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-strong">{a.nombre}</span>
                  {a.debe > 0 && <span className="text-sm font-semibold" style={{ color: "var(--danger)" }}>debe {pesos(a.debe)}</span>}
                  {a.enRevision > 0 && <span className="text-sm font-semibold tabular-nums text-muted" data-qa="en-revision">en revisión {pesos(a.enRevision)}</span>}
                  {a.aFavor > 0 && <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--success)" }} data-qa="a-favor">a favor {pesos(a.aFavor)}</span>}
                </div>
                <p className="text-sm text-muted">
                  {a.dadas} clase{a.dadas === 1 ? "" : "s"} dada{a.dadas === 1 ? "" : "s"}
                  {a.ultima && <> · última: <span className="capitalize">{diaHumano(a.ultima)}</span></>}
                </p>
                {a.devolverId && <BotonDevolver claseId={a.devolverId} nombre={a.nombre} monto={a.devolverMonto} />}
                <div className="grid grid-cols-2 gap-2">
                  <BotonLink alumnoId={a.id} nombre={a.nombre} />
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-strong sm:h-9">
                      WhatsApp
                    </a>
                  ) : (
                    <Link href={`/alumno/${a.token}`} className="flex h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-strong sm:h-9">Ver su link</Link>
                  )}
                </div>
                <BotonRegenerarLink alumnoId={a.id} nombre={a.nombre} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
