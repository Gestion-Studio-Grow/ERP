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

  const elegir = (id: string) => cambiarUrl({ pro: id });
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
      <div className="mb-3 flex items-center justify-between gap-3">
        {conChips ? (
          <div role="radiogroup" aria-label="Ver la agenda de" className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-1">
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
                  className={CHIP}
                  onClick={() => elegir(p.id)}
                  onKeyDown={(e) => alTeclear(e, i)}
                >
                  {p.nombre}
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        <button type="button" className={`${ENLACE} shrink-0`} onClick={() => cambiarUrl({ cel: "lista" })}>
          Ver lista
        </button>
      </div>
      <PorProfesional turnos={turnos} profesionales={profesionales} ahora={ahora} dia={dia} bloqueos={bloqueos} soloProfesional={elegida} />
    </div>
  );
}
