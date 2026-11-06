"use client";

// ============================================================================
// EL DÍA EN EL CELULAR, POR PROFESIONAL — agenda interactiva (AGENDA-INTERACCION.md §2.1, T1).
// ============================================================================
//
// Sólo con `permisos.interaccion` (apagado, CalendarGrid muestra la lista de siempre). Arriba, un
// chip por profesional (radiogroup: flechas para cambiar, ≥ 44 px); debajo, la grilla vertical de
// ESA profesional (la misma planilla, `PorProfesional` con `soloProfesional`): tocar un hueco abre
// «Dar turno» con la hora y la profesional puestas → servicio → clienta → Dar turno. La elegida se
// recuerda en `?pro=` (replaceState de la mesa, sin ir al servidor). «Ver lista» vuelve a la lista
// del día de siempre (`?cel=lista`). La PROFESSIONAL ve sólo la suya, sin chips.

import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { TurnoDelDia } from "../agenda-core";
import { hayQueElegirProfesional, profesionalElegida, type BloqueoDelDia } from "../grilla";
import { useMesa } from "./MesaDeTurnos";
import PorProfesional from "./PorProfesional";

const CHIP =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-3.5 text-sm font-medium text-body " +
  "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-checked:bg-surface-inverted aria-checked:text-surface";

const ENLACE =
  "inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function CelularPorProfesional({
  turnos,
  profesionales,
  ahora,
  dia,
  bloqueos,
  miProfesional,
  lista,
  conVerLista = true,
}: {
  turnos: TurnoDelDia[];
  profesionales: { id: string; nombre: string; box: string | null }[];
  ahora: string;
  dia: string;
  bloqueos: BloqueoDelDia[];
  /** El id de la profesional si quien mira es PROFESSIONAL (no elige). */
  miProfesional: string | null;
  /** La lista del día de siempre («Ver lista»). */
  lista: React.ReactNode;
  /** Sin «Ver lista» cuando la pantalla ya tiene la pestaña «Lista» (la agenda como objeto). */
  conVerLista?: boolean;
}) {
  const { cambiarUrl } = useMesa();
  const params = useSearchParams();
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const elegida = profesionalElegida({ profesionales, turnos, pedida: params.get("pro"), miProfesional });
  const verLista = params.get("cel") === "lista";
  const conChips = hayQueElegirProfesional(profesionales, miProfesional);

  if (verLista || !elegida) {
    return (
      <div>
        {elegida && (
          <p className="mb-2">
            <button type="button" className={ENLACE} onClick={() => cambiarUrl({ cel: null })}>
              Ver la grilla por profesional
            </button>
          </p>
        )}
        {lista}
      </div>
    );
  }

  const elegir = (id: string) => {
    cambiarUrl({ pro: id });
    // Sólo el renglón de chips se corre (block "nearest": la página no salta).
    chips.current[profesionales.findIndex((p) => p.id === id)]?.scrollIntoView({ inline: "nearest", block: "nearest" });
  };
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = profesionales.length;
    const destino =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (destino < 0) return;
    e.preventDefault();
    elegir(profesionales[destino].id);
    chips.current[destino]?.focus();
  };

  return (
    <div>
      {/* Los chips ocupan su renglón entero y se deslizan de costado (scroll-snap, sin mover la
          página); «Ver lista» va en su propio renglón, para no tapar el último chip (en 375 px
          «Marina» quedaba cortada). La elegida se trae a la vista al cambiar. */}
      <div className="mb-3 flex flex-col gap-1">
        {conChips && (
          <div
            role="radiogroup"
            aria-label="Ver la agenda de"
            className="-mx-1 flex min-w-0 snap-x snap-mandatory scroll-px-1 gap-2 overflow-x-auto overscroll-x-contain px-1 py-1"
          >
            {profesionales.map((p, i) => {
              const prendido = p.id === elegida;
              return (
                <button
                  key={p.id}
                  ref={(el) => {
                    chips.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={prendido}
                  tabIndex={prendido ? 0 : -1}
                  className={`${CHIP} snap-start`}
                  onClick={() => elegir(p.id)}
                  onKeyDown={(e) => alTeclear(e, i)}
                >
                  {p.nombre}
                </button>
              );
            })}
          </div>
        )}
        {conVerLista && (
          <button type="button" className={`${ENLACE} self-end`} onClick={() => cambiarUrl({ cel: "lista" })}>
            Ver lista
          </button>
        )}
      </div>
      <PorProfesional turnos={turnos} profesionales={profesionales} ahora={ahora} dia={dia} bloqueos={bloqueos} soloProfesional={elegida} />
    </div>
  );
}
