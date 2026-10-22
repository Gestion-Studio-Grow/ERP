"use client";

// HOJA «NO VINO» (M-068 · E19 · §2.3): «Se cobra igual» o «No se cobra», un toque cada una. La que
// viene marcada es la regla de Ajustes (`seCobraPorDefecto`). Hasta que llegue la regla «No vino:
// se cobra / no se cobra» (columna `ausenteSeCobra` de la Tanda 4, M-144), el default es «No se
// cobra» — provisional a confirmar. Si hay celular, «Escribirle» abre su WhatsApp.

import { Plata } from "@/components/ui";
import { cerrarPasada } from "@/lib/padel/acciones";
import { linkWhatsApp } from "@/lib/padel/core";
import { primerNombre } from "../_cola";
import { ErrorAccion, HojaPanel, grande, useAccion } from "./comun";
import type { ClaseAcciones } from "./tipos";

export function HojaNoVino({ c, onCerrar, seCobraPorDefecto = false }: { c: ClaseAcciones; onCerrar: () => void; seCobraPorDefecto?: boolean }) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const nombre = primerNombre(c.nombre);
  const wa = c.telefono ? linkWhatsApp(c.telefono, `Hola ${nombre}! Te esperé en la clase. ¿Está todo bien?`) : null;
  const marcar = (seCobra: boolean) =>
    correr(() => cerrarPasada(c.id, "ausente", seCobra), seCobra ? `No vino · se cobra igual` : "No vino · no se cobra", onCerrar);

  const opciones = [
    { seCobra: true, texto: "Se cobra igual", qa: "no-vino-se-cobra" },
    { seCobra: false, texto: "No se cobra", qa: "no-vino-no-se-cobra" },
  ];

  return (
    <HojaPanel
      onCerrar={onCerrar}
      titulo={`${nombre} no vino. ¿Se cobra?`}
      descripcion={c.precio > 0 ? <>Si se cobra, queda debiendo <Plata valor={c.precio} sinCentavos />.</> : undefined}
    >
      <div className="grid gap-2" role="group" aria-label="¿Se cobra?" aria-busy={pendiente}>
        {opciones.map((o) => {
          const porDefecto = o.seCobra === seCobraPorDefecto;
          return (
            <button
              key={o.qa}
              type="button"
              disabled={pendiente}
              autoFocus={porDefecto}
              onClick={() => marcar(o.seCobra)}
              className={grande(porDefecto ? "solid" : "outline")}
              data-qa={o.qa}
              data-default={porDefecto || undefined}
            >
              {porDefecto && <span aria-hidden>✓</span>}
              {o.texto}
              {porDefecto && <span className="font-normal opacity-80"> · lo de siempre</span>}
            </button>
          );
        })}
      </div>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-12 items-center justify-center text-sm font-semibold text-accent-ink underline underline-offset-2" data-qa="escribirle">
          Escribirle a {nombre} por WhatsApp
        </a>
      )}
      <ErrorAccion texto={error} className="mt-3" />
    </HojaPanel>
  );
}
