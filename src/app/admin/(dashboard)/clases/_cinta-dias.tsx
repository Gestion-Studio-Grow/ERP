"use client";

// Elegir día y hora tocando (matias-DISENO.md §1.1 principio 1 y 2): la CINTA de días (Hoy,
// Mañana, jue 24, … 14 días, de costado) y los CHIPS de horas libres. Sólo se ofrece lo libre: lo
// ocupado no aparece. «Otra hora…» es para el profe, que puede dar clase fuera de su grilla (lo
// único que el servidor frena es pisar otra clase). Sin animar: se ve cien veces al día.

import { useEffect, useId, useRef } from "react";
import { Chip, Esqueleto, cn } from "@/components/ui";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { horaHumana, horaValida } from "@/lib/padel/core";
import { chip48, Rotulo } from "./_hojas/comun";

export function CintaDias({
  dias,
  elegida,
  onElegir,
  etiqueta = "¿Qué día?",
}: {
  dias: readonly { fecha: string; etiqueta: string }[];
  elegida: string | null;
  onElegir: (fecha: string) => void;
  etiqueta?: string;
}) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  // El día elegido a la vista (si vino puesto desde un hueco de la semana que viene).
  useEffect(() => {
    caja.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return (
    <div>
      <Rotulo id={id}>{etiqueta}</Rotulo>
      <div ref={caja} role="group" aria-labelledby={id} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-qa="cinta-dias">
        {dias.map((d) => (
          <Chip key={d.fecha} prendido={d.fecha === elegida} onClick={() => onElegir(d.fecha)} className={cn(chip48, "capitalize")} data-fecha={d.fecha}>
            {d.etiqueta}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * Las horas libres de un día como chips. `elegida` es el ISO de la hora. Con `otraHora`, un chip
 * «Otra hora…» abre el selector de hora del celular (cada 15 min).
 */
export function ChipsHoras({
  fecha,
  libres,
  elegida,
  onElegir,
  cargando = false,
  otraHora = false,
  etiqueta = "¿A qué hora?",
  vacio = "Ese día no tenés huecos.",
}: {
  fecha: string | null;
  libres: readonly string[];
  elegida: string | null;
  onElegir: (iso: string | null) => void;
  cargando?: boolean;
  otraHora?: boolean;
  etiqueta?: string;
  vacio?: string;
}) {
  const id = useId();
  const idOtra = useId();
  const fuera = elegida !== null && !libres.includes(elegida);
  const horaFuera = fuera && elegida ? horaHumana(new Date(elegida)) : "";
  const elegirOtra = (hhmm: string) => {
    if (!fecha || !horaValida(hhmm)) return onElegir(null);
    onElegir(businessWallTimeToUtc(fecha, hhmm).toISOString());
  };

  return (
    <div>
      <Rotulo id={id}>
        {etiqueta} <span className="font-normal text-muted">(sólo libres)</span>
      </Rotulo>
      {cargando ? (
        <div className="flex flex-wrap gap-2" aria-busy="true">
          <span className="sr-only">Buscando las horas libres…</span>
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-12 w-20 rounded-full" />
          ))}
        </div>
      ) : (
        <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2" data-qa="chips-horas">
          {libres.map((iso) => (
            <Chip key={iso} prendido={iso === elegida} onClick={() => onElegir(iso === elegida ? null : iso)} className={cn(chip48, "tabular-nums")} data-hora={iso}>
              {horaHumana(new Date(iso))}
            </Chip>
          ))}
          {libres.length === 0 && <p className="py-2 text-sm text-muted">{vacio}</p>}
        </div>
      )}
      {otraHora && fecha && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={idOtra} className="text-sm text-muted">
            Otra hora…
          </label>
          <input
            id={idOtra}
            type="time"
            step={900}
            value={horaFuera}
            onChange={(e) => elegirOtra(e.target.value)}
            className={cn(
              "h-12 rounded-xl border border-line-strong bg-surface-raised px-3 text-base tabular-nums text-strong",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              fuera && "border-accent",
            )}
            data-qa="otra-hora"
          />
        </div>
      )}
    </div>
  );
}
