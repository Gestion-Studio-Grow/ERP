"use client";

// ============================================================================
// ALREDEDOR DE LA AGENDA — elegir el día y lo que quedó fuera de la grilla.
// ============================================================================
//
//   · `DiasDeLaAgenda`: ayer, hoy y los cinco que siguen (`diasDeLaAgenda`, agenda-core.ts: los mismos que el club
//     vanilla). Botones de 44 px con `aria-pressed`; la piel de Break Point (piel/agenda.css) los muestra de 32 px en
//     una línea («Vie 16/10») y deja el área de toque en 44. Cambiar de día no arma otra pantalla: es la MISMA grilla
//     con otro `dia` (el encabezado y las horas se reusan si el horario es igual).
//   · `FueraDeLaGrilla`: lo cancelado, suspendido o la falta de ese día, con la plata que queda pendiente: devolver
//     en mano a alguien sin ficha (sale de la caja) o cobrar la falta de alguien sin ficha (entra a la caja).

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { ejecutarCiclo, fueraDeGrilla, type FueraDeGrilla as Fila } from "./ciclo-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { diasDeLaAgenda } from "./agenda-core";
import { useSeleccion } from "./usar-almacen";

export function DiasDeLaAgenda({ hoy, dia, onDia }: { hoy: string; dia: string; onDia: (d: string) => void }) {
  const dias = diasDeLaAgenda(hoy);
  return (
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
              <Button variant="outline" size="md" onClick={() => almacen.ejecutar((e, a, auth) => ejecutarCiclo(e, f.id, { tipo: "devolver", medio }, a, auth), { deshacible: true })}>
                Devolver {pesos(f.devolver)}
              </Button>
            )}
            {f.cobrarFalta > 0 && (
              <Button variant="outline" size="md" onClick={() => almacen.ejecutar((e, a, auth) => ejecutarCiclo(e, f.id, { tipo: "cobrarFalta", medio }, a, auth), { deshacible: true })}>
                Cobrar la falta {pesos(f.cobrarFalta)}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
