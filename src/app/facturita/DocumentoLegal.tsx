// Marco de los textos legales de Facturita (términos y privacidad). Lleva SIEMPRE la franja de
// borrador hasta que el dueño (con su abogado) apruebe el texto: un texto legal sin revisar no se
// presenta como definitivo.

import type { ReactNode } from "react";
import VidrieraMarco from "./VidrieraMarco";

export type SeccionLegal = { titulo: string; parrafos: ReactNode[] };

export default function DocumentoLegal({
  titulo,
  vigencia,
  secciones,
}: {
  titulo: string;
  vigencia: string;
  secciones: SeccionLegal[];
}) {
  return (
    <VidrieraMarco>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p role="note" className="mb-6 rounded-xl border border-warning bg-warning-soft px-4 py-3 text-sm font-medium text-strong">
          Borrador a revisar por Gestión Studio Grow y su asesor legal. Los datos entre corchetes están
          pendientes de confirmar.
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-strong">{titulo}</h1>
        <p className="mt-2 text-sm text-muted">{vigencia}</p>
        {secciones.map((s, i) => (
          <section key={s.titulo} aria-labelledby={`seccion-${i}`} className="mt-8">
            <h2 id={`seccion-${i}`} className="text-lg font-semibold text-strong">
              {i + 1}. {s.titulo}
            </h2>
            {s.parrafos.map((p, j) => (
              <p key={j} className="mt-3 text-base leading-relaxed text-body">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </VidrieraMarco>
  );
}
