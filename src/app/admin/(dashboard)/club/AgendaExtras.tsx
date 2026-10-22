"use client";

// ============================================================================
// ALREDEDOR DE LA AGENDA — elegir el día y lo que quedó fuera de la grilla.
// ============================================================================
//
//   · `DiasDeLaAgenda`: ayer, hoy y los cinco que siguen (`diasDeLaAgenda`, agenda-core.ts: los mismos que el club
//     vanilla). Botones de 44 px con `aria-pressed`; la piel de Break Point (piel/agenda.css) los muestra de 32 px en
//     una línea («Vie 16/10») y deja el área de toque en 44. Cambiar de día no arma otra pantalla: es la MISMA grilla
//     con otro `dia` (el encabezado y las horas se reusan si el horario es igual). Más allá, el CALENDARIO (BP-013):
//     un `<input type="date">` de hoy a hoy + `config.diasAdelante` (14, el mismo número que el turnero); el día
//     elegido fuera de los 7 se suma como un botón más.
//   · `FueraDeLaGrilla`: lo cancelado, suspendido o la falta de ese día, con la plata que queda pendiente: devolver
//     en mano a alguien sin ficha (sale de la caja) o cobrar la falta de alguien sin ficha (entra a la caja).

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { fueraDeGrilla, type FueraDeGrilla as Fila } from "./ciclo-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { diasDeLaAgenda, fueraDelCalendario, type calendarioDeLaAgenda } from "./agenda-core";
import { useSeleccion } from "./usar-almacen";

export function DiasDeLaAgenda({ hoy, dia, onDia, calendario }: { hoy: string; dia: string; onDia: (d: string) => void; calendario?: ReturnType<typeof calendarioDeLaAgenda> }) {
  const dias = diasDeLaAgenda(hoy, dia, calendario?.dias);
  const [error, setError] = useState<string | null>(null);
  const ids = { cal: useId(), ayuda: useId(), error: useId() };
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
    <div role="group" aria-label="Elegir el día de la agenda" data-agenda="dias" className="flex gap-2 overflow-x-auto pb-1">
      {dias.map((d) => (
        <button
          key={d.fecha}
          type="button"
          aria-pressed={d.fecha === dia}
          onClick={() => onDia(d.fecha)}
          className={cn(
            "flex min-h-11 min-w-16 shrink-0 flex-col items-center justify-center rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-focus",
            d.fecha === dia ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong bg-surface-raised text-body",
          )}
        >
          {d.cerca && d.cerca !== "Hoy" && <span className="sr-only">{d.cerca}, </span>}
          <span className="text-xs">{d.nombre}</span>
          <span className="tabular-nums">{d.ddmm}</span>
        </button>
      ))}
    </div>
      {calendario && (
        <div data-agenda="calendario" className="flex flex-col gap-1 pb-1">
          <label htmlFor={ids.cal} className="text-xs text-muted">
            Otro día
          </label>
          <input
            id={ids.cal}
            type="date"
            min={calendario.min}
            max={calendario.max}
            value={dia >= calendario.min && dia <= calendario.max ? dia : ""}
            aria-describedby={error ? `${ids.ayuda} ${ids.error}` : ids.ayuda}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (!v) return;
              const no = fueraDelCalendario(calendario, v);
              setError(no);
              if (!no) onDia(v);
            }}
            className="min-h-11 rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong tabular-nums focus-visible:outline-2 focus-visible:outline-focus"
          />
          <span id={ids.ayuda} className="sr-only">
            {calendario.texto}
          </span>
          {error && (
            <p id={ids.error} role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const compartirLista = (previa: { firma: string; filas: Fila[] } | undefined, nueva: { firma: string; filas: Fila[] }) => (previa && previa.firma === nueva.firma ? previa : nueva);

export function FueraDeLaGrilla({ almacen, dia }: { almacen: Almacen; dia: string }) {
  const seleccionar = useCallback((e: EstadoClub) => {
    const filas = fueraDeGrilla(e, dia);
    return { filas, firma: JSON.stringify(filas) };
  }, [dia]);
  const { filas } = useSeleccion(almacen, seleccionar, compartirLista);
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  const idMedio = useId();
  if (!filas.length) return null;
  const pendientes = filas.some((f) => f.devolver > 0 || f.cobrarFalta > 0);
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface-raised p-3" open={pendientes}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">
        Cancelados, suspendidos y faltas de este día ({filas.length}){pendientes ? " · hay plata pendiente" : ""}
      </summary>
      {pendientes && (
        <div className="my-2 flex flex-col gap-1">
          <label htmlFor={idMedio} className="text-xs font-medium text-muted">
            Medio para devolver o cobrar
          </label>
          <Select
            id={idMedio}
            value={medio}
            onChange={(e) => setMedio(e.target.value as MedioCaja)}
            className="max-w-xs"
          >
            {MEDIOS_CAJA.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO[m]}
              </option>
            ))}
          </Select>
        </div>
      )}
      <ul className="flex flex-col text-sm">
        {filas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
            <span className="min-w-0 text-muted">{f.texto}</span>
            {f.devolver > 0 && (
              <Button variant="outline" size="md" onClick={() => almacen.comando("ciclo", [f.id, { tipo: "devolver", medio }], { deshacible: true })}>
                Devolver {pesos(f.devolver)}
              </Button>
            )}
            {f.cobrarFalta > 0 && (
              <Button variant="outline" size="md" onClick={() => almacen.comando("ciclo", [f.id, { tipo: "cobrarFalta", medio }], { deshacible: true })}>
                Cobrar la falta {pesos(f.cobrarFalta)}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
