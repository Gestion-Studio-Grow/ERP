"use client";

// EL EDITOR DE HORARIOS (E3 · M-078..M-082): un día por fila, chips «Mañana 8–12» «Tarde 16–21»
// y «+ Otro» (ruedas cada 30 min), «Copiar a…» con chips de días y la vista previa de lo que ve el
// alumno. Cero tipeo. Se guarda la grilla entera con un botón (es una grilla, no un campo): con
// cambios sin guardar, el aviso queda a la vista y salir pregunta antes (useAvisoSalida).
// Lo usan Ajustes → Horarios y el paso 2 de la Bienvenida.

import { useMemo, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { useGuardarCampo } from "../_campo";
import { chipEleccion } from "../_estilos";
import { useAvisoSalida } from "./_salida";
import {
  BLOQUES,
  DIA_CORTO,
  DIA_LARGO,
  OPCIONES_HORA,
  ORDEN_DIAS,
  agregarOtro,
  aTramos,
  alternarBloque,
  cambiarTramo,
  copiarA,
  erroresDe,
  hayErrores,
  horaCorta,
  iguales,
  quitarTramo,
  tieneBloque,
  vistaPrevia,
  type Semana,
} from "./grilla";

const selector =
  "h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-raised px-2 text-base tabular-nums text-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-danger";

export function EditorHorarios({
  inicial,
  duracionMin,
  textoGuardar = "Guardar horarios",
  alGuardar,
}: {
  inicial: Semana;
  duracionMin: number;
  textoGuardar?: string;
  /** Después de guardar bien (la Bienvenida pasa al paso siguiente). */
  alGuardar?: () => void;
}) {
  const [semana, setSemana] = useState<Semana>(inicial);
  const [guardada, setGuardada] = useState<Semana>(inicial);
  const [copiando, setCopiando] = useState<number | null>(null);
  const [destinos, setDestinos] = useState<number[]>([]);
  const { pendiente, error, guardar } = useGuardarCampo();
  const errores = useMemo(() => erroresDe(semana), [semana]);
  const sucio = !iguales(semana, guardada);
  const conErrores = hayErrores(semana);
  useAvisoSalida(sucio);

  const guardarTodo = () =>
    guardar("horarios", aTramos(semana), () => {
      setGuardada(semana);
      alGuardar?.();
    });

  const empezarCopia = (dia: number) => {
    setCopiando((c) => (c === dia ? null : dia));
    setDestinos([]);
  };

  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {ORDEN_DIAS.map((dia) => {
          const tramos = semana[dia];
          const otros = tramos.map((t, i) => ({ t, i })).filter(({ t }) => !BLOQUES.some((b) => b.desde === t.desde && b.hasta === t.hasta));
          return (
            <li key={dia} className="rounded-2xl border border-line bg-surface-raised p-3" data-qa={`dia-${dia}`}>
              <fieldset className="grid gap-2">
                <legend className="flex w-full items-baseline justify-between gap-2 text-base font-semibold text-strong">
                  <span>{DIA_LARGO[dia]}</span>
                  {!tramos.length && <span className="text-sm font-normal text-muted">No das clases</span>}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {BLOQUES.map((b) => (
                    <button key={b.id} type="button" aria-pressed={tieneBloque(tramos, b)} onClick={() => setSemana((s) => alternarBloque(s, dia, b))} className={chipEleccion} data-qa={`${b.id}-${dia}`}>
                      {b.rotulo}
                    </button>
                  ))}
                  <button type="button" onClick={() => setSemana((s) => agregarOtro(s, dia))} className={chipEleccion} data-qa={`otro-${dia}`}>
                    + Otro
                  </button>
                </div>

                {otros.map(({ t, i }) => {
                  const e = errores[dia][i];
                  const idErr = `err-${dia}-${i}`;
                  return (
                    <div key={i} className="grid gap-1" data-qa={`tramo-${dia}-${i}`}>
                      <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`desde-${dia}-${i}`}>{`${DIA_LARGO[dia]}, desde`}</label>
                        <select id={`desde-${dia}-${i}`} value={t.desde} onChange={(ev) => setSemana((s) => cambiarTramo(s, dia, i, "desde", ev.target.value))} className={selector} aria-invalid={Boolean(e) || undefined} aria-describedby={e ? idErr : undefined}>
                          {(OPCIONES_HORA.includes(t.desde) ? OPCIONES_HORA : [t.desde, ...OPCIONES_HORA]).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span aria-hidden className="text-muted">a</span>
                        <label className="sr-only" htmlFor={`hasta-${dia}-${i}`}>{`${DIA_LARGO[dia]}, hasta`}</label>
                        <select id={`hasta-${dia}-${i}`} value={t.hasta} onChange={(ev) => setSemana((s) => cambiarTramo(s, dia, i, "hasta", ev.target.value))} className={selector} aria-invalid={Boolean(e) || undefined} aria-describedby={e ? idErr : undefined}>
                          {(OPCIONES_HORA.includes(t.hasta) ? OPCIONES_HORA : [t.hasta, ...OPCIONES_HORA]).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setSemana((s) => quitarTramo(s, dia, i))} className="grid size-12 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-2 focus-visible:outline-focus" aria-label={`Quitar ${horaCorta(t.desde)} a ${horaCorta(t.hasta)} del ${DIA_LARGO[dia].toLowerCase()}`}>
                          ✕
                        </button>
                      </div>
                      {e && <p id={idErr} role="alert" className="text-sm font-semibold text-danger">{e}</p>}
                    </div>
                  );
                })}
                {/* Un tramo que coincide con un chip puede igual pisarse con uno «Otro»: se avisa acá. */}
                {tramos.some((t, i) => errores[dia][i] && BLOQUES.some((b) => b.desde === t.desde && b.hasta === t.hasta)) && (
                  <p role="alert" className="text-sm font-semibold text-danger">Un horario se pisa con otro de este día.</p>
                )}

                {tramos.length > 0 && (
                  <div className="grid gap-2">
                    <button type="button" onClick={() => empezarCopia(dia)} aria-expanded={copiando === dia} className="min-h-11 justify-self-start text-sm font-semibold text-accent-ink underline underline-offset-2" data-qa={`copiar-${dia}`}>
                      Copiar a…
                    </button>
                    {copiando === dia && (
                      <div className="grid gap-2 rounded-xl bg-surface-sunken p-2" role="group" aria-label={`Copiar los horarios del ${DIA_LARGO[dia].toLowerCase()} a otros días`}>
                        <div className="flex flex-wrap gap-2">
                          {ORDEN_DIAS.filter((d) => d !== dia).map((d) => (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={destinos.includes(d)}
                              onClick={() => setDestinos((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]))}
                              className={chipEleccion}
                              aria-label={DIA_LARGO[d]}
                              data-qa={`destino-${d}`}
                            >
                              {DIA_CORTO[d]}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={!destinos.length}
                          onClick={() => {
                            setSemana((s) => copiarA(s, dia, destinos));
                            setCopiando(null);
                            setDestinos([]);
                          }}
                          className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}
                          data-qa={`copiar-ok-${dia}`}
                        >
                          {destinos.length ? `Copiar a ${destinos.length} día${destinos.length === 1 ? "" : "s"}` : "Elegí los días"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>

      <p className="rounded-xl bg-surface-sunken px-3 py-2 text-sm text-strong" aria-live="polite" data-qa="vista-previa">
        {vistaPrevia(semana, duracionMin)}
      </p>

      <div className="sticky bottom-[var(--alto-barra-inferior,0px)] z-30 -mx-4 grid gap-2 border-t border-line bg-surface-raised px-4 pb-3 pt-3">
        {sucio && (
          <p role="status" className="rounded-lg bg-warning-soft px-3 py-1.5 text-sm font-semibold text-strong" data-qa="sin-guardar">
            Tenés cambios sin guardar
          </p>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        <button
          type="button"
          onClick={guardarTodo}
          disabled={pendiente || conErrores || (!sucio && !alGuardar)}
          className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")}
          data-qa="guardar-horarios"
        >
          {pendiente ? "Guardando…" : conErrores ? "Corregí lo marcado en rojo" : !sucio && !alGuardar ? "Guardado" : textoGuardar}
        </button>
      </div>
    </div>
  );
}
