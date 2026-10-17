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
import { armarAgenda, compartirAgenda, vecino, type CeldaTurno, type Direccion, type FranjaLibre, type VistaAgenda } from "./agenda-core";
import { Button } from "@/components/ui/Button";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { useSeleccion } from "./usar-almacen";

/** Alto de una franja de la grilla: 44 px, el piso táctil de la tablet de recepción (también el de un hueco libre). */
const FILA_REM = 2.75;
const FILA = `${FILA_REM}rem`;

const FLECHAS: Record<string, Direccion> = { ArrowUp: "arriba", ArrowDown: "abajo", ArrowLeft: "izquierda", ArrowRight: "derecha" };

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
        data-celda={celda.id}
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
        {/* El estado siempre con forma + palabra (nunca sólo el color del fondo), también en el turno de una hora.
            En uno de media hora (una franja) la marca va al lado del nombre. */}
        <span className="flex w-full min-w-0 items-baseline gap-1.5">
          <span className="truncate font-semibold text-strong">{celda.titular}</span>
          {celda.alto < 2 && <Marca tipo={celda.marca.tipo} className="shrink-0">{celda.marca.texto}</Marca>}
        </span>
        {celda.alto >= 2 && (
          <span className="w-full truncate text-xs tabular-nums text-muted">
            {celda.horario} · {celda.jugadores}
            {celda.tipo && celda.tipo !== "Turno" ? ` · ${celda.tipo}` : ""}
          </span>
        )}
        {celda.alto >= 2 && <Marca tipo={celda.marca.tipo}>{celda.marca.texto}</Marca>}
        {celda.senal && <span className="w-full truncate text-xs font-semibold tabular-nums text-danger">{celda.senal}</span>}
        {celda.deudor && celda.alto > 2 && <span className="w-full truncate text-xs text-danger">⚠ cuenta con deuda</span>}
      </button>
    </li>
  );
});

/**
 * Una franja libre: tocarla abre el alta desde esa hora. Mide una franja (44 px, como todo lo que se toca en la
 * tablet). Entra a la navegación con flechas de la grilla; con Tab se llega a los turnos (y, en un día vacío, al
 * primer hueco), así no son cien paradas de Tab.
 */
const Franja = memo(function Franja({
  franja,
  enTab,
  onReservar,
}: {
  franja: FranjaLibre;
  enTab: boolean;
  onReservar: (canchaId: string, min: number) => void;
}) {
  return (
    <li className="flex min-w-0" style={{ gridColumn: franja.columna + 2, gridRow: `${franja.fila + 2} / span 1` }}>
      <button
        type="button"
        id={idDeCelda(franja.id)}
        data-celda={franja.id}
        tabIndex={enTab ? 0 : -1}
        onClick={() => onReservar(franja.canchaId, franja.min)}
        aria-label={franja.etiqueta}
        className="z-0 m-px flex min-h-11 w-full items-center justify-center rounded text-xs text-faint hover:bg-accent-soft hover:text-strong focus-visible:outline-2 focus-visible:outline-focus"
      >
        + {franja.hora}
      </button>
    </li>
  );
});

/** El id del DOM de una celda (turno o hueco libre), para mover el foco con las flechas. */
function idDeCelda(id: string): string {
  return id.includes("@") ? `libre-${id.replace("@", "-")}` : `turno-${id}`;
}

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

export default function AgendaCanchas({
  almacen,
  dia,
  abierto,
  onAbrir,
  onReservar,
}: {
  almacen: Almacen;
  /** El día que se muestra ("AAAA-MM-DD"). */
  dia: string;
  abierto: string | null;
  onAbrir: (id: string) => void;
  /** Dar un turno: en una cancha y desde una hora (null = la primera libre). */
  onReservar: (canchaId: string, min: number | null) => void;
}) {
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarAgenda(e, dia, a), [dia]);
  const vista = useSeleccion(almacen, seleccionar, compartir);
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
  const libres = vista.libres;
  const alTeclear = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dir = FLECHAS[e.key];
      const id = (e.target as HTMLElement).dataset?.celda;
      if (!dir || !id) return;
      // Turnos y huecos libres son celdas de la misma grilla: las flechas pasan por los dos.
      const destino = vecino([...turnos, ...libres.map((l) => ({ ...l, alto: 1 }))], id, dir);
      if (!destino) return;
      e.preventDefault();
      document.getElementById(idDeCelda(destino))?.focus();
    },
    [turnos, libres],
  );

  const porCancha = vista.canchas.map((c, i) => ({
    cancha: c,
    turnos: turnos.filter((t) => t.columna === i),
    libres: libres.filter((l) => l.columna === i),
  }));
  // Con Tab se entra a la grilla por los turnos; en un día sin turnos, por el primer hueco libre.
  const primerLibreEnTab = turnos.length === 0 ? (libres[0]?.id ?? null) : null;

  return (
    <section aria-labelledby="club-agenda-titulo" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="club-agenda-titulo" className="text-lg font-semibold text-strong">
          Agenda de canchas
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">{vista.resumen}</p>
          <Button variant="solid" size="md" onClick={() => onReservar(vista.canchas.find((c) => !c.detalle.includes("mantenimiento"))?.id ?? vista.canchas[0]?.id ?? "", null)}>
            + Turno
          </Button>
        </div>
      </div>
      <p id="club-agenda-ayuda" className="sr-only">
        Cada cancha es una lista de turnos y huecos libres. Con las flechas pasás al de arriba, al de abajo o a la cancha de al lado. Enter abre la cuenta del turno o da un turno en el hueco.
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
          {vista.bloqueos.map((b) => (
            <div
              key={b.id}
              className="z-[1] m-0.5 flex flex-col overflow-hidden rounded-md border border-dashed border-line-strong bg-surface-sunken px-2 py-1 text-xs text-muted"
              style={{ gridColumn: b.columna + 2, gridRow: `${b.fila + 2} / span ${b.alto}` }}
            >
              <span className="font-semibold text-strong">Bloqueada</span>
              <span className="truncate">{b.motivo}</span>
            </div>
          ))}
          {porCancha.map(({ cancha, turnos: deLaCancha, libres: libresDeLaCancha }) => (
            <ul
              key={cancha.id}
              role="list"
              aria-label={`${cancha.nombre}, ${cancha.detalle}: ${deLaCancha.length === 1 ? "1 turno" : `${deLaCancha.length} turnos`}, ${libresDeLaCancha.length} huecos libres`}
              className="contents"
            >
              {deLaCancha.map((t) => (
                <BloqueTurno key={t.id} celda={t} activo={t.id === abierto} onAbrir={onAbrir} />
              ))}
              {libresDeLaCancha.map((f) => (
                <Franja key={f.id} franja={f} enTab={f.id === primerLibreEnTab} onReservar={onReservar} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
