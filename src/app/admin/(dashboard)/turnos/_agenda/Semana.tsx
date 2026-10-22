// ============================================================================
// LA SEMANA — una fila por profesional, una columna por día (reingeniería CH, Tanda 3 · §2.2).
// ============================================================================
//
// Presentacional (sin estado ni "use client"): todo lo decide `armarSemana` (semana-core.ts, con test)
// y cada cosa que se toca es un enlace —el día abre la agenda de ese día; la celda abre «Dar turno»
// con esa profesional y ese día—, así funciona con el teclado y sin JavaScript.
//
// La ocupación se dice con la cifra («80 %») y una barra; los huecos de 30′ o más, con su número y
// en salvia (la barra sola no alcanza: el color nunca va solo). En el celular la grilla de siete
// columnas no entra: se lee por día, una línea por profesional.

import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { pesos } from "../agenda-core";
import { etiquetaDeLaCelda, type CeldaDeLaSemana, type Semana as DatosDeLaSemana } from "./semana-core";

function Barra({ porcentaje }: { porcentaje: number | null }) {
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <span className="block h-full rounded-full bg-accent" style={{ width: `${porcentaje ?? 0}%` }} />
    </span>
  );
}

function Huecos({ n }: { n: number }) {
  if (n === 0) return <span className="text-muted">sin huecos</span>;
  return <span className="font-medium text-success">{n === 1 ? "1 hueco" : `${n} huecos`}</span>;
}

/** El contenido de una celda: la cifra, la barra y los huecos (o el motivo). */
function Contenido({ c }: { c: CeldaDeLaSemana }) {
  if (c.motivo) return <span className="text-[13px] text-muted">{c.motivo}</span>;
  return (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums text-strong">{c.porcentaje === null ? "—" : `${c.porcentaje} %`}</span>
        <span className="text-xs tabular-nums text-muted">{c.turnos === 1 ? "1 turno" : `${c.turnos} turnos`}</span>
      </span>
      <Barra porcentaje={c.porcentaje} />
      <span className="text-xs">
        <Huecos n={c.huecos.length} />
      </span>
    </>
  );
}

const CELDA = "flex min-h-[4.25rem] flex-col justify-between gap-1 rounded border border-line bg-surface-raised px-2.5 py-2 text-sm";

function Celda({ c, nombre }: { c: CeldaDeLaSemana; nombre: string }) {
  const etiqueta = etiquetaDeLaCelda(c, nombre);
  if (!c.hrefDarTurno) {
    return (
      <div className={cn(CELDA, c.motivo && "bg-surface-sunken")} aria-label={etiqueta} role="group">
        <Contenido c={c} />
      </div>
    );
  }
  return (
    <Link href={c.hrefDarTurno} aria-label={etiqueta} className={cn(CELDA, "hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}>
      <Contenido c={c} />
    </Link>
  );
}

export default function Semana({ semana, verPlata }: { semana: DatosDeLaSemana; /** El esperado en pesos sólo para quien ve la plata. */ verPlata: boolean }) {
  const { dias, filas, totales } = semana;
  if (filas.length === 0) {
    return <p className="border-t border-line py-6 text-sm text-muted">No hay profesionales activas para mostrar la semana.</p>;
  }
  const columnas = { gridTemplateColumns: `minmax(7rem, 9rem) repeat(${dias.length}, minmax(0, 1fr))` };
  return (
    <section aria-label={semana.titulo} data-pantalla="semana">
      {/* PC y tableta: la grilla. */}
      <div className="hidden md:block">
        <div role="table" aria-label={`Ocupación por profesional, ${semana.titulo.toLowerCase()}`} className="flex flex-col gap-1.5">
          <div role="row" className="grid items-end gap-1.5" style={columnas}>
            <span role="columnheader" className="text-xs font-medium uppercase tracking-wide text-muted">
              Profesional
            </span>
            {dias.map((d) => (
              <span role="columnheader" key={d.dia} aria-label={d.tituloLargo}>
                <Link
                  href={d.href}
                  className={cn(
                    "flex min-h-11 flex-col justify-end rounded px-1.5 pb-1 text-sm hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent",
                    d.esHoy && "bg-accent-soft",
                  )}
                  aria-label={`Abrir la agenda del ${d.tituloLargo}`}
                >
                  <span className="font-semibold capitalize text-strong">{d.titulo}</span>
                  <span className="text-xs text-muted">{d.esHoy ? "hoy" : d.turnos === 1 ? "1 turno" : `${d.turnos} turnos`}</span>
                </Link>
              </span>
            ))}
          </div>
          {filas.map((f) => (
            <div role="row" key={f.profesional.id} className="grid gap-1.5" style={columnas}>
              <span role="rowheader" className="flex flex-col justify-center">
                <span className="font-medium text-strong">{f.profesional.nombre}</span>
                {f.profesional.box && <span className="text-xs text-muted">{f.profesional.box}</span>}
              </span>
              {f.celdas.map((c) => (
                <span role="cell" key={c.dia} className="min-w-0">
                  <Celda c={c} nombre={f.profesional.nombre} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Celular: por día, una línea por profesional. */}
      <div className="flex flex-col gap-5 md:hidden">
        {dias.map((d, i) => (
          <section key={d.dia} aria-labelledby={`semana-dia-${d.dia}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 border-b border-line-strong pb-1">
              <h2 id={`semana-dia-${d.dia}`} className="text-base font-semibold capitalize text-strong">
                {d.titulo}
                {d.esHoy && <span className="ml-1.5 text-xs font-normal normal-case text-muted">hoy</span>}
              </h2>
              <Link href={d.href} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline-offset-2 hover:underline">
                Ver el día →
              </Link>
            </div>
            <ul className="flex flex-col gap-1.5">
              {filas.map((f) => (
                <li key={f.profesional.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-2">
                  <span className="flex items-center font-medium text-strong">{f.profesional.nombre}</span>
                  <Celda c={f.celdas[i]} nombre={f.profesional.nombre} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-sm text-body">
        <span className="font-medium text-strong">{totales.turnos === 1 ? "1 turno" : `${totales.turnos} turnos`}</span>
        {totales.sinConfirmar > 0 && ` · ${totales.sinConfirmar} sin confirmar`}
        {verPlata && totales.esperado > 0 && ` · ${pesos(totales.esperado)} esperado`}
        {` · ${totales.huecos === 1 ? "1 hueco" : `${totales.huecos} huecos`} de 30′ o más para dar`}
      </p>
      <p className="mt-1 text-xs text-muted">
        Ocupación = minutos con turno sobre el horario de trabajo, descontando francos y bloqueos. Tocá un día para abrirlo; tocá una celda
        para darle un turno a esa profesional ese día.
      </p>
    </section>
  );
}
