// Marco de los textos legales de Factoque (términos y privacidad). Plan de salida 11/2026 §1 #14:
// sin la franja de borrador; lo que el dueño aún no confirmó va entre corchetes «provisional a
// confirmar» (legales.ts). Rediseño 29/10/2026 (fronts/facturita/DISENO.md §5.4): documento sobre papel.

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
