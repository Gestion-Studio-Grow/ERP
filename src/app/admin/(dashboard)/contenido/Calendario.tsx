"use client";

// Calendario mes / semana. Cada publicación es un botón (Tab llega a todas, Enter la abre); en la grilla del mes las
// flechas mueven el foco entre días. El estado va con símbolo y palabra, no sólo con color.
import { useId, useRef, useState } from "react";
import {
  DIAS_CORTOS,
  ESTADOS,
  armarMes,
  armarSemana,
  mesDe,
  mesVecino,
  semanaVecina,
  sumarDias,
  type DiaDelCalendario,
  type EstadoPublicacion,
  type Publicacion,
} from "@/lib/contenido";
import { Button, Segmented, cn } from "@/components/ui";

const TONO: Record<EstadoPublicacion, string> = {
  borrador: "border-line-strong bg-surface text-body",
  programado: "border-accent bg-accent-soft text-accent-ink",
  publicado: "border-success bg-success-soft text-success",
};

function Chip({ p, onAbrir }: { p: DiaDelCalendario["publicaciones"][number]; onAbrir: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(p.id)}
      aria-label={p.descripcion}
      title={p.descripcion}
      className={cn(
        "block w-full min-w-0 truncate rounded-sm border px-1 py-0.5 text-left text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        TONO[p.estado],
      )}
    >
      <span aria-hidden>{ESTADOS[p.estado].simbolo}</span> {p.hora} {p.titulo}
    </button>
  );
}

export function Calendario({ publicaciones, hoy, onAbrir }: { publicaciones: Publicacion[]; hoy: string; onAbrir: (id: string) => void }) {
  const id = useId();
  const [vista, setVista] = useState<"mes" | "semana">("mes");
  const [mes, setMes] = useState(mesDe(hoy));
  const [semana, setSemana] = useState(hoy);
  const grilla = useRef<HTMLDivElement>(null);

  const vMes = armarMes(publicaciones, mes, hoy);
  const vSemana = armarSemana(publicaciones, semana, hoy);
  const titulo = vista === "mes" ? vMes.titulo : vSemana.titulo;
  const resumen = vista === "mes" ? vMes.resumen : vSemana.resumen;

  const mover = (delta: number) => (vista === "mes" ? setMes(mesVecino(mes, delta)) : setSemana(semanaVecina(semana, delta)));
  const volverAHoy = () => {
    setMes(mesDe(hoy));
    setSemana(hoy);
  };

  // Flechas dentro de la grilla del mes: ←/→ un día, ↑/↓ una semana (sólo entre días del mes visible).
  const teclas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const salto = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const fecha = (e.target as HTMLElement).closest<HTMLElement>("[data-fecha]")?.dataset.fecha;
    if (!salto || !fecha || (e.target as HTMLElement).dataset.fecha === undefined) return;
    const destino = grilla.current?.querySelector<HTMLElement>(`[data-fecha="${sumarDias(fecha, salto)}"]`);
    if (destino) {
      e.preventDefault();
      destino.focus();
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-lg border border-line bg-surface-raised p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-t`} className="text-lg font-semibold text-strong">
          Agenda · <span className="capitalize">{titulo}</span>
        </h2>
        <Segmented
          name={`${id}-vista`}
          leyenda="Vista"
          value={vista}
          onChange={(e) => {
            const v = (e.target as EventTarget as HTMLInputElement).value;
            if (v === "mes" || v === "semana") setVista(v);
          }}
          opciones={[
            { valor: "mes", etiqueta: "Mes" },
            { valor: "semana", etiqueta: "Semana" },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => mover(-1)} aria-label={vista === "mes" ? "Mes anterior" : "Semana anterior"}>
          ← Anterior
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={volverAHoy}>
          Hoy
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => mover(1)} aria-label={vista === "mes" ? "Mes siguiente" : "Semana siguiente"}>
          Siguiente →
        </Button>
        <p className="text-xs text-muted" aria-live="polite">
          {(Object.keys(ESTADOS) as EstadoPublicacion[]).map((e) => `${ESTADOS[e].simbolo} ${ESTADOS[e].etiqueta}: ${resumen.cuentas[e]}`).join(" · ")}
        </p>
      </div>

      {vista === "mes" ? (
        <div ref={grilla} role="grid" aria-label={`Publicaciones de ${vMes.titulo}`} onKeyDown={teclas} className="mt-4">
          <div role="row" className="grid grid-cols-7 gap-1">
            {DIAS_CORTOS.map((d) => (
              <div key={d} role="columnheader" className="text-center text-[11px] font-semibold uppercase text-muted">
                {d}
              </div>
            ))}
          </div>
          {vMes.semanas.map((fila, i) => (
            <div key={i} role="row" className="mt-1 grid grid-cols-7 gap-1">
              {fila.map((dia, j) =>
                dia ? (
                  <div
                    key={dia.fecha}
                    role="gridcell"
                    data-fecha={dia.fecha}
                    tabIndex={dia.hoy || (dia.numero === 1 && !vMes.dias.some((x) => x.hoy)) ? 0 : -1}
                    aria-label={`${dia.dia} ${dia.numero}${dia.hoy ? ", hoy" : ""}: ${dia.publicaciones.length ? `${dia.publicaciones.length} publicación(es)` : "sin publicaciones"}`}
                    className={cn(
                      "min-h-16 min-w-0 rounded-sm border p-0.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus sm:min-h-20 sm:p-1",
                      dia.hoy ? "border-accent" : "border-line",
                    )}
                  >
                    <span className={cn("block text-[11px]", dia.hoy ? "font-bold text-accent-ink" : "text-muted")}>{dia.numero}</span>
                    <div className="grid gap-0.5">
                      {dia.publicaciones.map((p) => (
                        <Chip key={p.id} p={p} onAbrir={onAbrir} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={`v${j}`} role="gridcell" aria-hidden className="min-h-16 sm:min-h-20" />
                ),
              )}
            </div>
          ))}
        </div>
      ) : (
        <ol className="mt-4 grid gap-2 sm:grid-cols-7">
          {vSemana.dias.map((dia) => (
            <li key={dia.fecha} className={cn("min-w-0 rounded-sm border p-2", dia.hoy ? "border-accent" : "border-line")}>
              <p className={cn("text-xs", dia.hoy ? "font-bold text-accent-ink" : "text-muted")}>
                {dia.dia} {dia.numero}
                {dia.hoy ? " · hoy" : ""}
              </p>
              {dia.publicaciones.length === 0 ? (
                <p className="mt-1 text-xs text-faint">—</p>
              ) : (
                <div className="mt-1 grid gap-1">
                  {dia.publicaciones.map((p) => (
                    <Chip key={p.id} p={p} onAbrir={onAbrir} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
