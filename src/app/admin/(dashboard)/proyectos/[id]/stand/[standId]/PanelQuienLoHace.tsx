"use client";

// «¿Quién lo hace?» (GSG-CRM-010): deriva el stand que se está dibujando a MIA Taller o MIA Agencia,
// en vivo, con las reglas puras de derivacion-core. Si va al Taller, arma la orden para el taller:
// el despiece SIN precios y las fechas del proyecto. Sólo se monta con el interruptor
// «derivacion-taller» prendido (lo decide page.tsx en el servidor). No guarda nada.

import { useMemo } from "react";
import { Badge } from "@/components/ui";
import { derivarProyecto, UNIDAD_LABEL } from "@/lib/proyectos/derivacion-core";
import { computar, type DisenoStand } from "@/lib/proyectos/stand";

export interface FechasProyecto {
  armado: string | null;
  evento: string | null;
  desarme: string | null;
}

export default function PanelQuienLoHace({ diseno, servicio, fechas }: { diseno: DisenoStand; servicio: string; fechas: FechasProyecto }) {
  const parte = useMemo(() => derivarProyecto({ servicio, stands: [diseno] }).partes[0], [diseno, servicio]);
  const lineas = useMemo(() => (parte.destino === "TALLER" ? computar(diseno) : []), [diseno, parte.destino]);
  const taller = parte.destino === "TALLER";
  const fechasCargadas = ([["Armado", fechas.armado], ["Evento", fechas.evento], ["Desarme", fechas.desarme]] as const).filter(([, f]) => f);

  return (
    <section aria-labelledby="quien-lo-hace" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quien-lo-hace" className="text-base font-semibold text-strong">¿Quién lo hace?</h2>
        <Badge tone={taller ? "success" : "info"}>{taller ? `Va a ${UNIDAD_LABEL.TALLER} (automático)` : `Queda en ${UNIDAD_LABEL.AGENCIA}`}</Badge>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {parte.motivos.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {taller && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-strong">Orden para el taller</h3>
          {fechasCargadas.length > 0 ? (
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {fechasCargadas.map(([que, f]) => (
                <div key={que}>
                  <dt className="text-muted">{que}</dt>
                  <dd className="text-strong">{f}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-sm text-muted">El proyecto todavía no tiene fechas de armado, evento ni desarme.</p>
          )}
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Despiece del stand, sin precios</caption>
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 font-medium">Qué</th>
                <th scope="col" className="py-1 text-right font-medium">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.clave} className="border-t border-line">
                  <td className="py-1 text-strong">{l.descripcion}</td>
                  <td className="py-1 text-right tabular-nums text-strong">
                    {String(l.cantidad).replace(".", ",")} {l.unidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
