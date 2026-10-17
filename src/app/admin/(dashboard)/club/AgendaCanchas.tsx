"use client";

// ============================================================================
// LA AGENDA DE CANCHAS — canchas × franjas del día; tocar un turno abre su cuenta.
// ============================================================================
//
// Mismo lenguaje que «Por profesional» de la agenda de CH (turnos/_agenda/PorProfesional.tsx): la
// hora fija a la izquierda, una columna por cancha y cada turno como un tramo con la hora, el
// titular y su marca de estado (forma + palabra, nunca sólo color). Lo que cambia es el dato: la
// cancha en vez del profesional y la señal de plata del club.
//
// Teclado: cada turno es un botón (Tab los recorre cancha por cancha, de arriba abajo) y las flechas
// van al de arriba/abajo en la misma cancha o al de la cancha de al lado (`vecino`, agenda-core.ts).
// Cada cancha es una lista con su nombre, para el lector de pantalla.
//
// Performance: la grilla se toca cientos de veces por día. Nada se anima. El fondo de franjas es un
// gradiente por columna (no una celda por franja), cada tramo es un `memo` que recibe la MISMA celda
// si no cambió (`compartirAgenda`), y la agenda entera no se repinta si la grilla quedó igual.

import { memo, useCallback, useEffect, useRef } from "react";
import { Marca } from "@/components/ui/Marca";
import { cn } from "@/components/ui/cn";
import { armarAgenda, compartirAgenda, vecino, type CeldaTurno, type Direccion, type VistaAgenda } from "./agenda-core";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { useSeleccion } from "./usar-almacen";

/** Alto de una franja de la grilla. Un turno de 60′ (2 franjas de 30′) mide 56 px: piso táctil. */
const FILA_REM = 1.75;
const FILA = `${FILA_REM}rem`;

const FLECHAS: Record<string, Direccion> = { ArrowUp: "arriba", ArrowDown: "abajo", ArrowLeft: "izquierda", ArrowRight: "derecha" };

const seleccionarAgenda = (e: EstadoClub, a: Ahora) => armarAgenda(e, a.fecha, a);
const compartir = (previa: VistaAgenda | undefined, nueva: VistaAgenda) => compartirAgenda(previa ?? null, nueva);

/** Cómo se ve cada estado: fondo y borde por token (la marca dice el estado en palabras). */
const TONO: Record<CeldaTurno["estado"], string> = {
  reservada: "bg-surface-raised border-line-strong",
  en_cancha: "bg-success-soft border-success/50",
  finalizada: "bg-surface-sunken border-line text-muted",
  cancelada: "bg-surface-sunken border-line",
  no_show: "bg-surface-sunken border-line",
  suspendida: "bg-surface-sunken border-line",
};

const BloqueTurno = memo(function BloqueTurno({ celda, activo, onAbrir }: { celda: CeldaTurno; activo: boolean; onAbrir: (id: string) => void }) {
  return (
    <li className="relative z-[1] m-0.5 flex min-w-0" style={{ gridColumn: celda.columna + 2, gridRow: `${celda.fila + 2} / span ${celda.alto}` }}>
      <button
        type="button"
        id={`turno-${celda.id}`}
        data-turno={celda.id}
        onClick={() => onAbrir(celda.id)}
        aria-label={`${celda.etiqueta}. Abrir la cuenta del turno`}
        aria-current={activo ? "true" : undefined}
        className={cn(
          "flex min-h-11 w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-md border px-2 py-1 text-left",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          TONO[celda.estado],
          celda.tipo === "Turno fijo" && "border-l-4 border-l-warning",
          activo && "ring-2 ring-accent",
        )}
      >
        <span className="flex w-full items-baseline gap-1.5">
          <span className="truncate font-semibold text-strong">{celda.titular}</span>
        </span>
        <span className="w-full truncate text-xs tabular-nums text-muted">
          {celda.horario} · {celda.jugadores}
          {celda.tipo && celda.tipo !== "Turno" ? ` · ${celda.tipo}` : ""}
        </span>
        {celda.alto > 2 && <Marca tipo={celda.marca.tipo}>{celda.marca.texto}</Marca>}
        {celda.senal && <span className="w-full truncate text-xs font-semibold tabular-nums text-danger">{celda.senal}</span>}
        {celda.deudor && celda.alto > 2 && <span className="w-full truncate text-xs text-danger">⚠ cuenta con deuda</span>}
      </button>
    </li>
  );
});

/** El fondo fijo de la grilla (encabezados, horas y franjas). Sólo cambia si cambian las canchas o el horario. */
const FondoDeLaGrilla = memo(function FondoDeLaGrilla({ canchas, horas, filas }: Pick<VistaAgenda, "canchas" | "horas" | "filas">) {
  return (
    <>
      <div className="sticky left-0 top-0 z-30 border-b border-line bg-surface" style={{ gridColumn: 1, gridRow: 1 }} />
      {canchas.map((c, i) => (
        <div
          key={c.id}
          aria-hidden
          className="sticky top-0 z-20 flex flex-col justify-center border-b border-l border-line bg-surface px-2"
          style={{ gridColumn: i + 2, gridRow: 1 }}
        >
          <span className="truncate font-semibold text-strong">{c.nombre}</span>
          <span className="truncate text-xs text-muted">{c.detalle}</span>
        </div>
      ))}
      {horas.map((h) => (
        <div
          key={h.texto}
          aria-hidden
          className="sticky left-0 z-10 bg-surface pr-2 pt-0.5 text-right text-xs tabular-nums text-muted"
          style={{ gridColumn: 1, gridRow: `${h.fila + 2} / span 2` }}
        >
          {h.texto}
        </div>
      ))}
      {canchas.map((c, i) => (
        <div
          key={`fondo-${c.id}`}
          aria-hidden
          className="border-l border-line"
          style={{
            gridColumn: i + 2,
            gridRow: `2 / span ${filas}`,
            backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
            backgroundSize: `100% calc(${FILA} * 2)`,
          }}
        />
      ))}
    </>
  );
});

export default function AgendaCanchas({ almacen, abierto, onAbrir }: { almacen: Almacen; abierto: string | null; onAbrir: (id: string) => void }) {
  const vista = useSeleccion(almacen, seleccionarAgenda, compartir);
  const marco = useRef<HTMLDivElement>(null);
  const yaUbicada = useRef(false);

  // Al entrar, la grilla arranca mostrando la hora de ahora (no las 9 de la mañana). Una sola vez:
  // después manda la persona.
  const filaAhora = vista.ahora;
  useEffect(() => {
    const m = marco.current;
    if (!m || filaAhora === null || yaUbicada.current) return;
    yaUbicada.current = true;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    m.scrollTop = Math.max(0, 3 * rem + filaAhora * FILA_REM * rem - m.clientHeight / 3);
  }, [filaAhora]);

  const turnos = vista.turnos;
  const alTeclear = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dir = FLECHAS[e.key];
      const id = (e.target as HTMLElement).dataset?.turno;
      if (!dir || !id) return;
      const destino = vecino(turnos, id, dir);
      if (!destino) return;
      e.preventDefault();
      document.getElementById(`turno-${destino}`)?.focus();
    },
    [turnos],
  );

  const porCancha = vista.canchas.map((c, i) => ({ cancha: c, turnos: turnos.filter((t) => t.columna === i) }));

  return (
    <section aria-labelledby="club-agenda-titulo" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="club-agenda-titulo" className="text-lg font-semibold text-strong">
          Agenda de canchas
        </h2>
        <p className="text-sm text-muted">{vista.resumen}</p>
      </div>
      <p id="club-agenda-ayuda" className="sr-only">
        Cada cancha es una lista de turnos. Con las flechas pasás al turno de arriba, de abajo o de la cancha de al lado. Enter abre la cuenta del turno.
      </p>
      <div
        ref={marco}
        onKeyDown={alTeclear}
        aria-describedby="club-agenda-ayuda"
        className="max-h-[70vh] overflow-auto overscroll-contain rounded-lg border border-line bg-surface"
      >
        <div
          className="relative grid text-sm"
          style={{
            gridTemplateColumns: `3.5rem repeat(${vista.canchas.length}, minmax(7.5rem, 1fr))`,
            gridTemplateRows: `3rem repeat(${vista.filas}, ${FILA})`,
          }}
        >
          <FondoDeLaGrilla canchas={vista.canchas} horas={vista.horas} filas={vista.filas} />
          {filaAhora !== null && (
            <div
              aria-hidden
              className="pointer-events-none relative z-0"
              style={{ gridColumn: `2 / span ${vista.canchas.length}`, gridRow: `2 / span ${vista.filas}` }}
            >
              <div className="absolute inset-x-0 border-t-2 border-danger" style={{ top: `calc(${filaAhora} * ${FILA})` }} />
            </div>
          )}
          {porCancha.map(({ cancha, turnos: deLaCancha }) => (
            <ul key={cancha.id} role="list" aria-label={`${cancha.nombre}, ${cancha.detalle}: ${deLaCancha.length === 1 ? "1 turno" : `${deLaCancha.length} turnos`}`} className="contents">
              {deLaCancha.map((t) => (
                <BloqueTurno key={t.id} celda={t} activo={t.id === abierto} onAbrir={onAbrir} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
