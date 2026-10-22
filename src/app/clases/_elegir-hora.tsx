"use client";

// La cinta de días + los chips de horas libres: la usan el turnero y «Cambiar horario». Sólo se
// ofrece lo libre (principio 2): lo ocupado no aparece. Chips de 48 px; la cinta se desliza de
// costado sin correr la página (sin scroll horizontal de la pantalla, M-089). La hora, siempre en
// la del negocio. No se anima (se ve muchas veces por día).

import type { DiaConLugar } from "@/lib/padel/datos.server";
import { chip } from "./_estilos";
import { horaCorta } from "./cinta";

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
    <div className="grid grid-cols-1 gap-4">
      <div>
        <h3 id={`${prefijo}-dia`} className="mb-2 text-base font-bold">
          ¿Qué día?
        </h3>
        <div
          role="group"
          data-cinta
          aria-labelledby={`${prefijo}-dia`}
          className="-mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]"
        >
          {dias.map((d) => (
            <button
              key={d.fecha}
              type="button"
              aria-pressed={d.fecha === fecha}
              data-qa="dia"
              data-fecha={d.fecha}
              onClick={() => onFecha(d.fecha)}
              className={`${chip(d.fecha === fecha)} snap-start`}
            >
              {d.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 id={`${prefijo}-hora`} className="mb-2 text-base font-bold">
          ¿A qué hora?
        </h3>
        <div role="group" aria-labelledby={`${prefijo}-hora`} className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2">
          {horas.map((h) => (
            <button key={h} type="button" aria-pressed={h === hora} data-qa="hora" data-hora={h} onClick={() => onHora(h)} className={chip(h === hora)}>
              {horaCorta(h)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
