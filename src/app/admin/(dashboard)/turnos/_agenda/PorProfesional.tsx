"use client";

// ============================================================================
// POR PROFESIONAL — el día como planilla de boxes (la segunda vista de la agenda).
// ============================================================================
//
// La lista del día contesta «¿quién sigue?»; esta vista contesta «¿dónde hay un hueco?»: una
// columna por profesional (con su box), la hora a la izquierda cada media hora, y cada turno como
// un tramo con la hora, la clienta y su marca de estado (forma + palabra, nunca sólo color). Tocar
// un tramo abre el mismo cajón que la lista. Sin colores por profesional ni bordes de color: el
// estado lo dice la marca.
//
// En el celular la planilla se desliza de costado dentro de su marco (la hora queda fija a la
// izquierda); la página no.

import { fmtTime, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import { Marca } from "@/components/ui";
import { marcaDelTurno, minutosEntre, type TurnoDelDia } from "../agenda-core";

const PASO_MIN = 30;

/** Minutos desde la medianoche, en la hora del negocio. */
function minutosDelDia(iso: string): number {
  const { hour, minute } = wallHourMinuteInBusinessTz(new Date(iso));
  return hour * 60 + minute;
}

/** El tramo de horas a dibujar: de 9 a 19, estirado si algún turno cae afuera. */
export function tramoDelDia(turnos: readonly Pick<TurnoDelDia, "inicio" | "fin">[]): { desde: number; hasta: number } {
  let desde = 9 * 60;
  let hasta = 19 * 60;
  for (const t of turnos) {
    desde = Math.min(desde, Math.floor(minutosDelDia(t.inicio) / PASO_MIN) * PASO_MIN);
    hasta = Math.max(hasta, Math.ceil((minutosDelDia(t.inicio) + minutosEntre(t.inicio, t.fin)) / PASO_MIN) * PASO_MIN);
  }
  return { desde, hasta };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function PorProfesional({
  turnos,
  profesionales,
  ahora,
  onAbrir,
}: {
  turnos: TurnoDelDia[];
  profesionales: { id: string; nombre: string; box: string | null }[];
  ahora: string;
  onAbrir: (id: string) => void;
}) {
  const reloj = new Date(ahora);
  const { desde, hasta } = tramoDelDia(turnos);
  const filas = Math.max(1, (hasta - desde) / PASO_MIN);
  const columnas = profesionales.length;

  return (
    <div className="overflow-x-auto border-t border-line-strong" role="region" aria-label="La agenda por profesional" tabIndex={0}>
      <div
        className="grid min-w-full text-sm"
        style={{
          gridTemplateColumns: `3.5rem repeat(${columnas}, minmax(9.5rem, 1fr))`,
          gridTemplateRows: `2.75rem repeat(${filas}, 2.25rem)`,
        }}
      >
        <div className="sticky left-0 z-10 border-b border-line bg-surface" style={{ gridColumn: 1, gridRow: 1 }} />
        {profesionales.map((p, c) => (
          <div key={p.id} className="flex flex-col justify-center border-b border-l border-line px-2" style={{ gridColumn: c + 2, gridRow: 1 }}>
            <span className="truncate font-semibold text-strong">{p.nombre}</span>
            {p.box && <span className="truncate text-xs text-muted">{p.box}</span>}
          </div>
        ))}
        {Array.from({ length: filas }, (_, f) => (
          <div
            key={`h-${f}`}
            className="sticky left-0 z-10 border-b border-line bg-surface pr-2 pt-0.5 text-right text-xs tabular-nums text-muted"
            style={{ gridColumn: 1, gridRow: f + 2 }}
          >
            {(desde + f * PASO_MIN) % 60 === 0 ? hhmm(desde + f * PASO_MIN) : ""}
          </div>
        ))}
        {profesionales.map((p, c) =>
          Array.from({ length: filas }, (_, f) => (
            <div key={`c-${p.id}-${f}`} className="border-b border-l border-line/60" style={{ gridColumn: c + 2, gridRow: f + 2 }} />
          )),
        )}
        {turnos.map((t) => {
          const c = profesionales.findIndex((p) => p.id === t.profesionalId);
          if (c < 0) return null;
          const inicio = minutosDelDia(t.inicio);
          const fila = Math.floor((inicio - desde) / PASO_MIN) + 2;
          const alto = Math.max(1, Math.round(minutosEntre(t.inicio, t.fin) / PASO_MIN));
          const marca = marcaDelTurno(t, reloj);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onAbrir(t.id)}
              aria-label={`${fmtTime(t.inicio)}, ${t.clienta}, ${t.servicio}, ${marca.texto}: abrir el turno`}
              className="z-[1] m-0.5 flex min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded border border-line-strong bg-surface-raised px-2 py-1 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
              style={{ gridColumn: c + 2, gridRow: `${fila} / span ${alto}` }}
            >
              <span className="flex w-full items-baseline gap-1.5">
                <span className="text-xs font-semibold tabular-nums text-strong">{fmtTime(t.inicio)}</span>
                <span className="truncate font-medium text-strong">{t.clienta}</span>
              </span>
              {alto > 1 && <span className="w-full truncate text-xs text-muted">{t.servicio}</span>}
              {alto > 1 && <Marca tipo={marca.tipo}>{marca.texto}</Marca>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
