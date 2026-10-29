"use client";
// «Hecho» de la hoja de los fijos (Tanda 3C, BP-100…104): lo que se hizo, «Avisar a Juan por WhatsApp» y un botón
// «Avisar a … que recupera su turno» por cada fijo que recupera fechas. Sale de FijosYEspera.tsx (dictamen v7: la nota
// de esos botones) para poder probarlo sin navegador.

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { BotonWhatsApp } from "./WhatsAppDelClub";
import { enlaceWhatsApp, type ModoDelClub } from "./whatsapp-core";

export interface Hecho {
  fijoId: string;
  titular: string;
  mensaje: string;
  texto: string;
  celular: string;
  /** Los otros fijos que recuperan fechas por esto (observación 3 del dictamen v6): un WhatsApp para cada uno. */
  recuperan: { titular: string; celular: string; texto: string }[];
}

/** Después de confirmar: qué se hizo y «Avisar a Juan por WhatsApp» (en la lista, fuera del diálogo). En su archivo (sin CSS) para probarlo con `renderToStaticMarkup`. */
export function HechoDeLaBaja({ hecho, modo, onListo }: { hecho: Hecho; modo: ModoDelClub; onListo: () => void }) {
  const enlace = enlaceWhatsApp(hecho.celular, hecho.texto, modo);
  const nota = useId();
  return (
    <div data-fijos="hecho" role="status" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3 text-sm">
      <p className="font-medium text-strong">{hecho.mensaje}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonWhatsApp enlace={enlace} notaEn={enlace.nota ? nota : undefined} nombreAccesible={`Avisar a ${hecho.titular} por WhatsApp`}>
          Avisar a {hecho.titular.split(" ")[0]} por WhatsApp
        </BotonWhatsApp>
        {hecho.recuperan.map((r, i) => {
          const e = enlaceWhatsApp(r.celular, r.texto, modo);
          return (
            // Dictamen v7: cada botón lleva SU nota (demo, sin celular, celular raro). Si es la misma que la del titular
            // (la demo, o los dos sin celular), comparte el texto de abajo (`notaEn`) y no se repite; si es otra, la
            // muestra al lado de su botón. En los dos casos el botón la anuncia (`aria-describedby`).
            <BotonWhatsApp key={i} enlace={e} notaEn={e.nota && e.nota === enlace.nota ? nota : undefined} nombreAccesible={`Avisar a ${r.titular} que recupera su turno`}>
              Avisar a {r.titular.split(" ")[0]} que recupera su turno
            </BotonWhatsApp>
          );
        })}
        <Button variant="ghost" size="md" onClick={onListo}>
          Listo
        </Button>
      </div>
      {enlace.nota && (
        <p id={nota} className="text-xs text-muted">
          {enlace.nota}
        </p>
      )}
    </div>
  );
}
