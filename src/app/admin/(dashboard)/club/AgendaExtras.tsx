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
//   · `BuscarLugar` (bp-DISENO §3.2, Rec. 7): hora + duración → una opción por cancha, primero las que ENTRAN a esa hora
//     y después lo más cerca (`buscarLugar`, agenda-core.ts); tocar una abre el alta armada en esa cancha y hora.
//   · `CompartirLoLibre` (§3.16, Rec. 48): hoy / mañana · tarde / noche → el texto con los huecos de la duración de
//     siempre, el precio y el link del turnero (`textoLoLibre`, whatsapp-core.ts), para copiar o abrir WhatsApp.
//   · `FueraDeLaGrilla`: lo cancelado, suspendido o la falta de ese día, con la plata que queda pendiente: devolver
//     en mano a alguien sin ficha (sale de la caja) o cobrar la falta de alguien sin ficha (entra a la caja).

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { fueraDeGrilla, type FueraDeGrilla as Fila } from "./ciclo-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { buscarLugar, diasDeLaAgenda, fueraDelCalendario, horaPorDefecto, horasParaBuscar, type calendarioDeLaAgenda, type LugarEncontrado } from "./agenda-core";
import { DURACIONES } from "./alta-core";
import { linkParaClientes } from "./configuracion-core";
import { enlaceLoLibre, textoLoLibre, type DiaLibre, type FranjaLibreWa } from "./whatsapp-core";
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

// ───────────── «Buscar lugar» ─────────────

const compartirPorFirma = <T extends { firma: string }>(previa: T | undefined, nueva: T) => (previa && previa.firma === nueva.firma ? previa : nueva);

/** Un grupo de botones con `aria-pressed` (botones en vez de `<select>`: bp-DISENO §1.1, principio 7). */
function Opciones<T extends string | number>({ etiqueta, opciones, valor, onCambiar }: { etiqueta: string; opciones: readonly { valor: T; texto: string }[]; valor: T; onCambiar: (v: T) => void }) {
  return (
    <div role="group" aria-label={etiqueta} data-agenda="opciones" className="flex flex-wrap gap-1">
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={cn(
            "min-h-11 rounded-md border px-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-focus",
            o.valor === valor ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong bg-surface-raised text-body",
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function BuscarLugar({ id, almacen, dia, onElegir, onCerrar }: { id: string; almacen: Almacen; dia: string; onElegir: (canchaId: string, inicio: number, duracion: number) => void; onCerrar: () => void }) {
  const [inicio, setInicio] = useState(() => horaPorDefecto(almacen.estado(), dia, almacen.ahora()));
  const [duracion, setDuracion] = useState<number>(() => almacen.estado().config.duracionTurno);
  const ids = { titulo: useId(), hora: useId() };
  const seleccionar = useCallback(
    (e: EstadoClub, ahora: Ahora) => {
      const r = buscarLugar(e, { fecha: dia, inicio, duracion }, ahora);
      return { ...r, horas: horasParaBuscar(e, dia), firma: JSON.stringify([r, dia, horasParaBuscar(e, dia).length]) };
    },
    [dia, inicio, duracion],
  );
  const { opciones, aviso, horas } = useSeleccion(almacen, seleccionar, compartirPorFirma);
  return (
    <section id={id} aria-labelledby={ids.titulo} data-agenda="buscar-lugar" className="mb-2 flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <h3 id={ids.titulo} className="w-full text-sm font-semibold text-strong">
          Buscar lugar
        </h3>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.hora} className="text-xs font-medium text-muted">
            Hora
          </label>
          <Select id={ids.hora} value={String(inicio)} onChange={(e) => setInicio(Number(e.target.value))} className="tabular-nums">
            {horas.map((h) => (
              <option key={h.min} value={h.min}>
                {h.texto}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted" aria-hidden="true">
            Duración
          </span>
          <Opciones etiqueta="Duración" opciones={DURACIONES.map((d) => ({ valor: d, texto: `${d} min` }))} valor={duracion} onCambiar={setDuracion} />
        </div>
      </div>
      {aviso && (
        <p role="status" className="text-sm text-body">
          {aviso}
        </p>
      )}
      {opciones.length > 0 && (
        <ul aria-label="Dónde hay lugar" className="flex flex-wrap gap-2">
          {opciones.map((o: LugarEncontrado) => (
            <li key={o.canchaId}>
              <button
                type="button"
                data-lugar={o.exacto ? "entra" : "cerca"}
                onClick={() => onElegir(o.canchaId, o.inicio, o.duracion)}
                aria-label={`${o.etiqueta}, ${o.duracion} minutos${o.exacto ? "" : ", a otra hora"}: dar el turno`}
                className={cn(
                  "min-h-11 rounded-md border px-3 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-focus",
                  o.exacto ? "border-accent bg-accent-soft text-strong" : "border-line-strong bg-surface text-body",
                )}
              >
                {o.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="ghost" size="md" onClick={onCerrar}>
          Listo
        </Button>
      </div>
    </section>
  );
}

// ───────────── «Compartir lo libre» ─────────────

const DIAS_LIBRE: readonly { valor: DiaLibre; texto: string }[] = [
  { valor: "hoy", texto: "Hoy" },
  { valor: "manana", texto: "Mañana" },
];
const FRANJAS: readonly { valor: FranjaLibreWa; texto: string }[] = [
  { valor: "tarde", texto: "Tarde" },
  { valor: "noche", texto: "Noche" },
  { valor: "todo", texto: "Todo el día" },
];

export function CompartirLoLibre({ id, almacen, onCerrar }: { id: string; almacen: Almacen; onCerrar: () => void }) {
  const [dia, setDia] = useState<DiaLibre>("hoy");
  const [franja, setFranja] = useState<FranjaLibreWa>("noche");
  const [copiado, setCopiado] = useState<string | null>(null);
  const ids = { titulo: useId(), texto: useId() };
  // El link del turnero de ESTE club (con su WhatsApp y sus tarifas), en la misma dirección donde corre el club.
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const seleccionar = useCallback(
    (e: EstadoClub, ahora: Ahora) => {
      const texto = textoLoLibre(e, dia, franja, ahora, origen ? linkParaClientes(e, origen) : null);
      return { texto, firma: texto };
    },
    [dia, franja, origen],
  );
  const { texto } = useSeleccion(almacen, seleccionar, compartirPorFirma);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado("Copiado: pegalo en el chat.");
    } catch {
      setCopiado("No se pudo copiar solo: seleccioná el texto y copialo.");
    }
  };
  return (
    <section id={id} aria-labelledby={ids.titulo} data-agenda="lo-libre" className="mb-2 flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3">
      <h3 id={ids.titulo} className="text-sm font-semibold text-strong">
        Compartir lo libre
      </h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Opciones etiqueta="Qué día" opciones={DIAS_LIBRE} valor={dia} onCambiar={(v) => (setDia(v), setCopiado(null))} />
        <Opciones etiqueta="Qué franja" opciones={FRANJAS} valor={franja} onCambiar={(v) => (setFranja(v), setCopiado(null))} />
      </div>
      <p id={ids.texto} aria-label="El texto para mandar" data-agenda="texto-libre" className="whitespace-pre-line break-words rounded-md border border-line bg-surface p-3 text-sm text-body tabular-nums">
        {texto}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="md" onClick={copiar}>
          Copiar el texto
        </Button>
        <a
          href={enlaceLoLibre(texto)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-surface-raised px-3 text-sm font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus"
        >
          Abrir WhatsApp<span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        <Button variant="ghost" size="md" onClick={onCerrar}>
          Listo
        </Button>
        <p role="status" className="text-sm text-muted">
          {copiado ?? ""}
        </p>
      </div>
    </section>
  );
}
