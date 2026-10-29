"use client";

// La cinta de días + los chips de horas libres: la usan el turnero y «Cambiar horario». Sólo se
// ofrece lo libre (principio 2): lo ocupado no aparece. La cinta son chips altos con el nombre del
// día arriba y el número grande (en la compu entran 7 sin deslizar; en el celular, 4 y medio: el
// medio chip cortado invita a deslizar). Se desliza de costado sin correr la página (M-089). Las
// horas, en chips de 56 px con la pelota como punto en la elegida, bajo un título que dice qué día
// es y cuántas quedan («Jueves 29 · 6 horarios libres»). La hora, siempre en la del negocio. Al
// cambiar de día las horas no se animan (se ve muchas veces por día).

import type { DiaConLugar } from "@/lib/padel/datos.server";
import { cn } from "@/components/ui/cn";
import { chip, foco, tituloSeccion } from "./_estilos";
import { Pelota } from "./_iconos";
import { horaCorta } from "./cinta";

const fechaUtc = (fecha: string) => new Date(`${fecha}T12:00:00.000Z`);
const nombreDia = (fecha: string, largo: "short" | "long") =>
  fechaUtc(fecha).toLocaleDateString("es-AR", { weekday: largo, timeZone: "UTC" }).replace(".", "");

/** «Jueves 29» (el título de las horas: se entiende sin mirar la cinta). */
export function diaLargo(fecha: string): string {
  const n = nombreDia(fecha, "long");
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${fechaUtc(fecha).getUTCDate()}`;
}

export function ElegirHora({
  dias,
  fecha,
  hora,
  onFecha,
  onHora,
  prefijo,
}: {
  dias: readonly DiaConLugar[];
  fecha: string;
  hora: string | null;
  onFecha: (fecha: string) => void;
  onHora: (iso: string) => void;
  /** Para los id de los títulos (dos selectores en la misma pantalla no chocan). */
  prefijo: string;
}) {
  const horas = dias.find((d) => d.fecha === fecha)?.horas ?? [];
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h3 id={`${prefijo}-dia`} className={cn(tituloSeccion, "mb-3")}>
          ¿Qué día?
        </h3>
        <div
          role="group"
          data-cinta
          aria-labelledby={`${prefijo}-dia`}
          className="-mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5"
        >
          {dias.map((d) => {
            const activo = d.fecha === fecha;
            const relativo = /^(hoy|mañana)$/i.test(d.etiqueta);
            return (
              <button
                key={d.fecha}
                type="button"
                aria-pressed={activo}
                // El nombre accesible es la etiqueta de siempre («Hoy», «Mañana», «vie 24»).
                aria-label={d.etiqueta}
                data-qa="dia"
                data-fecha={d.fecha}
                onClick={() => onFecha(d.fecha)}
                className={cn(
                  "pz-num flex min-h-[4.5rem] w-[4.625rem] shrink-0 snap-start cursor-pointer flex-col items-center justify-center rounded-[0.875rem] border-[1.5px] px-1 py-1.5 leading-none",
                  "transition-transform duration-[var(--dur-1,120ms)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
                  "lg:w-[calc((100%-3rem)/7)]",
                  foco,
                  activo
                    ? "border-[var(--padel-cancha)] bg-[var(--padel-cancha)] text-[var(--padel-sobre-cancha)]"
                    : "border-[var(--padel-linea)] bg-[var(--padel-superficie)] text-[var(--padel-texto)]",
                )}
              >
                <span aria-hidden className={cn("font-semibold uppercase", relativo ? "text-[0.6875rem] tracking-[0.04em]" : "text-[0.8125rem] tracking-[0.12em]")}>
                  {relativo ? d.etiqueta : nombreDia(d.fecha, "short")}
                </span>
                <span aria-hidden className="pz-display mt-1 text-[clamp(1.5rem,2.2vw,2rem)] font-bold">
                  {fechaUtc(d.fecha).getUTCDate()}
                </span>
                {relativo && (
                  <span aria-hidden className="mt-0.5 text-[0.75rem] font-semibold">
                    {nombreDia(d.fecha, "short")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <h3 id={`${prefijo}-hora`} className={cn(tituloSeccion, "mb-3")}>
          {fecha ? diaLargo(fecha) : "¿A qué hora?"}
          {horas.length > 0 && (
            <span className="pz-num font-[inherit] text-[var(--padel-suave)]">
              {` · ${horas.length} ${horas.length === 1 ? "horario libre" : "horarios libres"}`}
            </span>
          )}
        </h3>
        <div role="group" aria-labelledby={`${prefijo}-hora`} className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {horas.map((h) => (
            <button key={h} type="button" aria-pressed={h === hora} data-qa="hora" data-hora={h} onClick={() => onHora(h)} className={chip(h === hora)}>
              {h === hora && <Pelota className="pz-aparece size-3.5 shrink-0" costura="var(--padel-cancha)" />}
              {horaCorta(h)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
