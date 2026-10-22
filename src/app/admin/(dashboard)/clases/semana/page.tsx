import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { AvisoError, Icono, Plata, cn } from "@/components/ui";
import { badgePendientes, semanaDelProfe } from "@/lib/padel/datos.server";
import { todayInBusinessTz } from "@/lib/datetime";
import { fechaValida, semanaDesdeLunes, sumarDias } from "@/lib/padel/core";
import { Cabecera } from "../_cabecera";
import { BotonBloquearDias, BotonReintentar, BotonSuspender } from "../_acciones";
import { LineaDelDia, delDia } from "../_linea-dia";
import { INICIAL_DIA, clases as nClases, diaLargo, puntitos, rangoDeSemana } from "../_agenda-core";
import { DeslizarSemana } from "./DeslizarSemana";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Semana", manifest: "/clases/app.webmanifest" };

const flecha = "grid size-12 shrink-0 place-items-center rounded-xl border border-line text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// SEMANA (matias-DISENO.md §2.3 · M-056..M-059): SIEMPRE de lunes a domingo. Arriba, ‹ la semana ›
// con lo que suma (clases, plata esperada y cobrada); la tira L…D con la carga de cada día y hoy
// resaltado; abajo, cada día con sus clases, sus huecos tocables (abren Agendar con día y hora) y
// sus bloqueos. Un día en que no das clases dice «No das clases», no «Libre». Deslizar de costado
// cambia de semana.
export default async function ClasesSemana({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  await requireApp("padel-clases");
  const { desde: q } = await searchParams;
  const hoy = todayInBusinessTz();
  const lunes = semanaDesdeLunes(q && fechaValida(q) ? q : hoy);
  const href = (f: string) => `/admin/clases/semana?desde=${f}`;

  let datos: Awaited<ReturnType<typeof semanaDelProfe>>;
  let numero = 0;
  try {
    [datos, numero] = await Promise.all([semanaDelProfe(lunes), badgePendientes()]);
  } catch (e) {
    unstable_rethrow(e);
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        <Cabecera titulo="Semana" pendientes={0} />
        <AvisoError titulo="No pudimos cargar la semana" comoSeguir="Puede ser la señal. Tus clases están guardadas: probá de nuevo." accion={<BotonReintentar />} />
      </main>
    );
  }

  const { dias, totales } = datos;
  const esEstaSemana = lunes === semanaDesdeLunes(hoy);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera
        titulo="Semana"
        detalle={
          <span className="tabular-nums" data-qa="resumen-semana">
            {nClases(totales.clases)} · <Plata valor={totales.esperado} sinCentavos /> esperados · <Plata valor={totales.cobrado} sinCentavos tono="cobrado" /> cobrados
          </span>
        }
        pendientes={numero}
      />

      <DeslizarSemana anterior={href(sumarDias(lunes, -7))} siguiente={href(sumarDias(lunes, 7))}>
        <nav aria-label="Cambiar de semana" className="mb-3 flex items-center justify-between gap-2">
          <Link href={href(sumarDias(lunes, -7))} className={flecha} aria-label="Semana anterior" data-qa="semana-anterior">
            <span aria-hidden className="text-xl">‹</span>
          </Link>
          <p className="min-w-0 text-center">
            <span className="block text-lg font-bold tabular-nums text-strong" data-qa="rango-semana">{rangoDeSemana(lunes)}</span>
            {!esEstaSemana && (
              <Link href="/admin/clases/semana" className="inline-flex min-h-12 items-center text-sm font-semibold text-accent-ink underline underline-offset-2">
                Volver a esta semana
              </Link>
            )}
          </p>
          <Link href={href(sumarDias(lunes, 7))} className={flecha} aria-label="Semana siguiente" data-qa="semana-siguiente">
            <span aria-hidden className="text-xl">›</span>
          </Link>
        </nav>

        {/* La tira: cada día con su carga; tocar uno baja a su línea. */}
        <ol className="mb-5 grid grid-cols-7 gap-1" aria-label="Los días de la semana" data-qa="tira-semana">
          {dias.map((d, i) => {
            const vivas = d.clases.filter((c) => ["PEDIDA", "CONFIRMADA", "DADA"].includes(c.estado)).length;
            const esHoy = d.fecha === hoy;
            return (
              <li key={d.fecha}>
                <a
                  href={`#dia-${d.fecha}`}
                  aria-current={esHoy ? "date" : undefined}
                  aria-label={`${diaLargo(d.fecha)}: ${d.trabaja || vivas ? nClases(vivas) : "no das clases"}`}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    esHoy ? "bg-accent text-on-accent" : "text-strong hover:bg-surface-sunken",
                  )}
                  data-qa={esHoy ? "tira-hoy" : "tira-dia"}
                >
                  <span className="font-semibold">{INICIAL_DIA[i]}</span>
                  <span className="tabular-nums">{Number(d.fecha.slice(8))}</span>
                  <span aria-hidden className="flex h-2 gap-0.5">
                    {d.trabaja || vivas
                      ? Array.from({ length: puntitos(vivas) }, (_, k) => <span key={k} className={cn("size-1.5 rounded-full", esHoy ? "bg-on-accent" : "bg-accent")} />)
                      : <span className={cn("h-0.5 w-3 self-center rounded-full", esHoy ? "bg-on-accent" : "bg-line-strong")} />}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>

        <div className="grid gap-5">
          {dias.map((d) => {
            const pasado = d.fecha < hoy;
            const otras = delDia(d.clases);
            const hayAlgo = d.clases.length > 0 || d.huecos.length > 0 || d.bloqueos.length > 0;
            const vivas = d.clases.some((c) => ["PEDIDA", "CONFIRMADA"].includes(c.estado));
            return (
              <section key={d.fecha} id={`dia-${d.fecha}`} aria-label={diaLargo(d.fecha)} className="scroll-mt-4" data-qa="dia-semana">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className={cn("text-sm font-bold uppercase tracking-wide", d.fecha === hoy ? "text-accent-ink" : "text-strong")}>
                    {d.fecha === hoy ? "Hoy · " : ""}
                    {diaLargo(d.fecha)}
                  </h2>
                  {!pasado && (d.trabaja || vivas) && <BotonSuspender fecha={d.fecha} etiquetaDia={diaLargo(d.fecha)} clases={otras} />}
                </div>
                {!d.trabaja && d.clases.length === 0 && d.bloqueos.length === 0 ? (
                  <p className="text-sm text-muted" data-qa="no-das-clases">No das clases.</p>
                ) : !hayAlgo ? (
                  <p className="text-sm text-muted">{pasado ? "No hubo clases." : "Sin horarios libres."}</p>
                ) : (
                  <LineaDelDia fecha={d.fecha} clases={d.clases} huecos={d.huecos} bloqueos={d.bloqueos} qa="clase-semana" />
                )}
              </section>
            );
          })}
        </div>
      </DeslizarSemana>

      <div className="mt-6">
        <BotonBloquearDias desde={lunes < hoy ? hoy : lunes} />
      </div>
      <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted">
        <Icono nombre="flecha" className="size-3.5" /> Deslizá de costado para cambiar de semana.
      </p>
    </main>
  );
}
