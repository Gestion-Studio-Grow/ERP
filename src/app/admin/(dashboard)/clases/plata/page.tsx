import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, chipLinkAtributos, cn, EmptyState, Plata } from "@/components/ui";
import { badgePendientes, plata } from "@/lib/padel/datos.server";
import { tarjeta } from "../_vista";
import { Cabecera } from "../_cabecera";
import { PERIODOS, desgloseCorto, periodoDe, rotuloCobrado, rotuloDadas } from "./periodo";
import { paraDevolver } from "./datos.server";
import { CobrarTodo, LeDevolvi, Recordarle } from "./_acciones-plata";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Plata", manifest: "/clases/app.webmanifest" };

// PLATA (matias-DISENO.md §2.3 · M-073/M-074/M-075): cuánto te deben (la cifra grande, en
// Fraunces), lo cobrado en el período por medio, las clases dadas y el .csv; abajo, quién debe
// ordenado por monto con «Cobrar todo» y «Recordarle», y quién tiene plata a favor.
// «Te deben» es TODO lo que se debe (no sólo del período): la deuda no vence con el mes.
export default async function ClasesPlata({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireApp("padel-clases");
  const periodo = periodoDe((await searchParams).periodo);
  const [p, numero] = await Promise.all([plata(periodo), badgePendientes()]);
  const devolver = await paraDevolver(p.aFavor);
  const medios = desgloseCorto(p.cobrado.porMedio);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Plata" detalle="Lo que cobraste y lo que te deben." pendientes={numero} />

      <nav aria-label="Período" className="mb-4 flex gap-2">
        {PERIODOS.map((o) => (
          <Link key={o.valor} href={`/admin/clases/plata?periodo=${o.valor}`} {...chipLinkAtributos(o.valor === periodo, "min-h-12 px-5 sm:min-h-12")} data-qa={`periodo-${o.valor}`}>
            {o.rotulo}
          </Link>
        ))}
      </nav>

      <section className={cn(tarjeta, "mb-5 grid gap-4")} aria-label="Resumen">
        <div>
          <p className="text-sm font-semibold text-muted">Te deben</p>
          <p className={cn("font-display text-[2.25rem] leading-tight tracking-[-0.03em]", p.teDeben > 0 ? "text-danger" : "text-strong")} data-qa="te-deben">
            <Plata valor={p.teDeben} sinCentavos tono={p.teDeben > 0 ? "peligro" : undefined} />
          </p>
        </div>
        <div>
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-base font-semibold text-strong">
            <span>{rotuloCobrado(periodo)}</span>
            <Plata valor={p.cobrado.total} sinCentavos tono="cobrado" />
          </p>
          {medios.length > 0 ? (
            <p className="mt-1 text-sm text-muted" data-qa="por-medio">
              {medios.map((m, i) => (
                <span key={m.medio}>
                  {i > 0 && " · "}
                  {m.rotulo} <Plata valor={m.monto} sinCentavos />
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Todavía no cobraste nada en este período.</p>
          )}
        </div>
        <p className="text-sm text-strong" data-qa="dadas">{rotuloDadas(periodo, p.dadas)}</p>
        <a href={`/admin/clases/plata/exportar?periodo=${periodo}`} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="exportar" download>
          Bajar los cobros ({PERIODOS.find((o) => o.valor === periodo)?.rotulo.toLowerCase()}) en planilla .csv
        </a>
      </section>

      <section aria-labelledby="t-deben" className="mb-6">
        <h2 id="t-deben" className="mb-2 text-sm font-bold uppercase tracking-wide text-strong">Quién debe</h2>
        {p.quienDebe.length === 0 ? (
          <EmptyState title="Nadie te debe. 👏" description="Cuando des una clase y no te la paguen, aparece acá." />
        ) : (
          <ul className="grid gap-3">
            {p.quienDebe.map((d) => (
              <li key={d.alumnoId} className={cn(tarjeta, "grid gap-3")} data-qa="deudor">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/clases/alumnos/${d.alumnoId}`} className="min-h-11 content-center text-base font-semibold text-strong underline-offset-2 hover:underline">
                    {d.nombre}
                  </Link>
                  <span className="text-sm text-muted">
                    <Plata valor={d.total} sinCentavos tono="peligro" className="font-semibold" /> · {d.cantidad} clase{d.cantidad === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CobrarTodo alumnoId={d.alumnoId} nombre={d.nombre} total={d.total} cantidad={d.cantidad} />
                  <Recordarle alumnoId={d.alumnoId} nombre={d.nombre} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.aFavor.length > 0 && (
        <section aria-labelledby="t-favor">
          <h2 id="t-favor" className="mb-2 text-sm font-bold uppercase tracking-wide text-strong">Tienen plata a favor</h2>
          <p className="mb-2 text-sm text-muted">Clases pagadas que se cancelaron: la próxima que agendes se paga sola con eso.</p>
          <ul className="grid gap-3">
            {p.aFavor.map((a) => {
              const dev = devolver.get(a.alumnoId);
              return (
                <li key={a.alumnoId} className={cn(tarjeta, "grid gap-3")} data-qa="a-favor">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/admin/clases/alumnos/${a.alumnoId}`} className="min-h-11 content-center text-base font-semibold text-strong underline-offset-2 hover:underline">
                      {a.nombre}
                    </Link>
                    <span className="text-sm text-muted">
                      a favor <Plata valor={a.aFavor} sinCentavos tono="cobrado" className="font-semibold" />
                    </span>
                  </div>
                  {dev && <LeDevolvi claseId={dev.claseId} nombre={a.nombre} monto={dev.monto} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
