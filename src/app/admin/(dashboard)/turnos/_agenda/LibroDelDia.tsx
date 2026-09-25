"use client";

// ============================================================================
// EL LIBRO DEL DÍA — la agenda de la recepción como renglones («Renglón»).
// ============================================================================
//
// Un renglón por turno (RenglonDelTurno, en MesaDeTurnos.tsx): la hora en el folio; la clienta (se
// toca y abre el cajón del turno) y en la segunda línea el servicio, la duración, la profesional, el
// box y la marca de estado; la plata en su columna; UNA tecla con el paso que sigue y «Más» con lo
// demás. Entre lo que ya pasó y lo que viene, la raya de «ahora» con la hora (el riesgo de esta
// pantalla). Lo resuelto (terminado y cobrado, no vino) se lee tachado.
//
//   · Filtros en la URL (`?ver=sin-confirmar`): chips con conteo; cambiar de filtro no va al
//     servidor (los turnos del día ya están acá). Así un enlace del Inicio abre la agenda filtrada.
//   · `?turno=<id>` abre el cajón de ese turno (Atrás lo cierra).
//   · Teclado: ↑/↓ o j/k recorren los turnos, Enter abre el cajón, Esc lo cierra.
//   · La tecla «Cobrar»/«Terminar y cobrar» abre una hoja chica con el cobro (en el celular, a mano
//     del pulgar); «Confirmar» y «Terminar» sin saldo se hacen de un toque.
//   · Vista «Por profesional»: la misma mesa (cajón y hoja) sobre la planilla de boxes.

import { Fragment, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui";
import { teclaDeLaPantalla } from "@/components/ui/tecla-de-pantalla";
import { accionDeTecla, moverFoco } from "@/components/ui/tabla-core";
import { fmtTime } from "@/lib/datetime";
import { FILTROS_AGENDA, entraEnFiltro, leerFiltroAgenda, lugarDeLaRaya, type Permisos, type TurnoDelDia } from "../agenda-core";
import MesaDeTurnos, { RenglonDelTurno, useMesa } from "./MesaDeTurnos";
import PorProfesional from "./PorProfesional";

/** ↑/↓ o j/k recorren los botones `[data-abrir]` de la lista (Enter abre el cajón). */
export function useRecorrerTurnos(lista: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (!teclaDeLaPantalla(e)) return;
      // Las mismas teclas que mueven el foco de fila en las tablas (tabla-core.ts).
      const accion = accionDeTecla(e);
      if (accion?.tipo !== "mover") return;
      const botones = [...(lista.current?.querySelectorAll<HTMLButtonElement>("[data-abrir]") ?? [])];
      if (botones.length === 0) return;
      e.preventDefault();
      const siguiente = moverFoco(botones.findIndex((b) => b === document.activeElement), accion.delta, botones.length);
      botones[siguiente]?.focus();
      botones[siguiente]?.closest("li")?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [lista]);
}

function ElDia({
  turnos,
  esHoy,
  vacio,
  vista,
  profesionales,
  ahora,
}: {
  turnos: TurnoDelDia[];
  esHoy: boolean;
  vacio: React.ReactNode;
  vista: "lista" | "profesionales";
  profesionales: { id: string; nombre: string; box: string | null }[];
  ahora: string;
}) {
  const { reloj, abrir, cambiarUrl } = useMesa();
  const params = useSearchParams();
  const filtro = leerFiltroAgenda(params.get("ver"));
  const lista = useRef<HTMLOListElement>(null);
  useRecorrerTurnos(lista);

  if (vista === "profesionales") {
    if (turnos.length === 0 && profesionales.length === 0) return <>{vacio}</>;
    return (
      <>
        {profesionales.length > 0 && <PorProfesional turnos={turnos} profesionales={profesionales} ahora={ahora} onAbrir={abrir} />}
        {turnos.length === 0 && <div className="mt-4">{vacio}</div>}
      </>
    );
  }

  if (turnos.length === 0) return <>{vacio}</>;

  const visibles = turnos.filter((t) => entraEnFiltro(t, filtro, reloj));
  const raya = filtro === "todos" ? lugarDeLaRaya(visibles, esHoy, reloj) : null;
  const conteo = (f: (typeof FILTROS_AGENDA)[number]["id"]) => turnos.filter((t) => entraEnFiltro(t, f, reloj)).length;

  return (
    <>
      <div data-ui="filtros" role="group" aria-label="Ver">
        {FILTROS_AGENDA.map((f) => {
          const n = f.id === "todos" ? turnos.length : conteo(f.id);
          if (f.id !== "todos" && n === 0) return null;
          return (
            <Chip key={f.id} prendido={filtro === f.id} conteo={n} onClick={() => cambiarUrl({ ver: f.id === "todos" ? null : f.id })}>
              {f.etiqueta}
            </Chip>
          );
        })}
      </div>
      {visibles.length === 0 ? (
        <p className="border-b border-line py-4 text-sm text-muted">
          No hay turnos {FILTROS_AGENDA.find((f) => f.id === filtro)?.etiqueta.toLowerCase()} este día.{" "}
          <button type="button" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-2 hover:underline" onClick={() => cambiarUrl({ ver: null })}>
            Ver todos
          </button>
        </p>
      ) : (
        <ol ref={lista} aria-label="Turnos del día" className="border-t border-line-strong">
          {visibles.map((t, i) => (
            <Fragment key={t.id}>
              {raya === i && (
                <li
                  role="separator"
                  aria-label={`Ahora, ${fmtTime(reloj)}`}
                  className="flex items-center gap-2 py-1 text-xs font-semibold tabular-nums text-accent-ink before:h-0 before:w-3 before:border-t-2 before:border-accent after:h-0 after:flex-1 after:border-t-2 after:border-accent"
                >
                  Ahora {fmtTime(reloj)}
                </li>
              )}
              <RenglonDelTurno t={t} />
            </Fragment>
          ))}
        </ol>
      )}
    </>
  );
}

export default function LibroDelDia({
  turnos,
  permisos,
  ahora,
  esHoy,
  hrefFicha,
  vacio,
  vista = "lista",
  profesionales = [],
}: {
  turnos: TurnoDelDia[];
  permisos: Permisos;
  ahora: string;
  esHoy: boolean;
  /** Base de la ficha de la clienta («/admin/clientes/»), si quien mira puede abrir Clientes. */
  hrefFicha: string | null;
  /** Lo que se dice si el día no tiene turnos (con su tecla). */
  vacio: React.ReactNode;
  /** «lista» (el libro del día) o «profesionales» (la planilla de boxes). Mismo cajón. */
  vista?: "lista" | "profesionales";
  profesionales?: { id: string; nombre: string; box: string | null }[];
}) {
  return (
    <div data-agenda="libro">
      <MesaDeTurnos turnos={turnos} permisos={permisos} ahora={ahora} hrefFicha={hrefFicha}>
        <ElDia turnos={turnos} esHoy={esHoy} vacio={vacio} vista={vista} profesionales={profesionales} ahora={ahora} />
      </MesaDeTurnos>
    </div>
  );
}
