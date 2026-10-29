"use client";

// «¿Qué incluye?» (fronts/agendaprofe/DISENO.md §5.3): la ficha de la clase en una hoja. Dice sólo
// lo que el profe cargó: duración, precio (total y por persona), dónde (con mapa), la regla de
// cancelación y cómo se paga. Lo que no está cargado no se dibuja (nada de «$ 0» ni «a confirmar»).
// Con horarios, el pie lleva «Elegir horario» (cierra y lleva el foco a la cinta).

import { useState, type ReactNode } from "react";
import { HojaPublica } from "./_hoja";
import { botonPrincipal, botonTexto, foco } from "./_estilos";
import { IconoMapa, IconoReloj } from "./_iconos";
import { plata } from "./cinta";

export interface InfoClase {
  duracionMin: number;
  precioIndividual: number;
  precioGrupal: number;
  lugar: string;
  maps: string | null;
  regla: string;
}

export function FichaClase({ info, conHorarios }: { info: InfoClase; conHorarios: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const filas: { dt: string; dd: ReactNode }[] = [];
  if (info.duracionMin > 0) filas.push({ dt: "Duración", dd: `${info.duracionMin} min` });
  if (info.precioIndividual > 0) filas.push({ dt: "Individual", dd: plata(info.precioIndividual) });
  if (info.precioGrupal > 0) filas.push({ dt: "Con amigos (2 a 4)", dd: `${plata(info.precioGrupal)} por persona` });
  if (info.lugar)
    filas.push({
      dt: "Dónde",
      dd: info.maps ? (
        <a href={info.maps} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--padel-cancha)] underline underline-offset-2 ${foco}`}>
          <IconoMapa className="size-5 shrink-0" />
          {info.lugar}
          <span className="sr-only"> (abre el mapa)</span>
        </a>
      ) : (
        info.lugar
      ),
    });
  filas.push({ dt: "Pago", dd: "Por alias o en efectivo" });

  return (
    <>
      <button type="button" className={`${botonTexto} min-h-12`} onClick={() => setAbierta(true)} data-qa="que-incluye">
        ¿Qué incluye?
      </button>
      <HojaPublica
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Qué incluye la clase"
        qa="hoja-ficha"
        pie={
          conHorarios ? (
            <button
              type="button"
              className={botonPrincipal}
              onClick={() => {
                setAbierta(false);
                // Después de cerrar: el <dialog> devuelve el foco a quien lo abrió; recién ahí se lleva a la cinta.
                window.setTimeout(() => {
                  const cinta = document.getElementById("cinta");
                  cinta?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                  cinta?.querySelector<HTMLButtonElement>("[data-qa=dia][aria-pressed=true]")?.focus({ preventScroll: true });
                }, 60);
              }}
            >
              Elegir horario
            </button>
          ) : undefined
        }
      >
        <dl className="grid gap-0 text-[1.0625rem]">
          {filas.map((f) => (
            <div key={f.dt} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-[1.5px] border-[var(--padel-linea)] py-3 last:border-b-0">
              <dt className="text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-[var(--padel-suave)]">{f.dt}</dt>
              <dd className="pz-num font-semibold">{f.dd}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 flex items-start gap-2 text-base text-[var(--padel-suave)]">
          <IconoReloj className="mt-0.5 size-5 shrink-0" />
          <span>{info.regla}.</span>
        </p>
      </HojaPublica>
    </>
  );
}
