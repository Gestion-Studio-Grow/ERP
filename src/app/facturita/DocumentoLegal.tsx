// Marco de los textos legales de Facturita (términos y privacidad). Lleva SIEMPRE la franja de
// borrador hasta que el dueño (con su abogado) apruebe el texto: un texto legal sin revisar no se
// presenta como definitivo.
//
// Rediseño 29/10/2026 (fronts/facturita/DISENO.md §5.4): documento sobre papel; la franja sigue
// (es verdad, legales.ts), en gris cálido con filete verde en lugar del amarillo de advertencia.

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
      <div className="fx-caja" style={{ maxWidth: "calc(880px + 2 * var(--fx-gutter))", paddingBlock: "clamp(32px, 2rem + 3vw, 96px)" }}>
        <p role="note" className="fx-borrador">
          Borrador a revisar por Gestión Studio Grow y su asesor legal. Los datos entre corchetes están
          pendientes de confirmar.
        </p>
        <article className="fx-doc">
          <h1>{titulo}</h1>
          <p className="fx-tenue">{vigencia}</p>
          {secciones.map((s, i) => (
            <section key={s.titulo} aria-labelledby={`seccion-${i}`}>
              <h2 id={`seccion-${i}`}>
                {i + 1}. {s.titulo}
              </h2>
              {s.parrafos.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </VidrieraMarco>
  );
}
