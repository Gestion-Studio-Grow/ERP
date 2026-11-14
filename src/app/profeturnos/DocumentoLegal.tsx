// PROFETURNOS · Documento legal (términos y privacidad): la misma estructura que el de Factoque
// (src/app/facturita/DocumentoLegal.tsx, mismo tipo `SeccionLegal`) sobre el marco de ProfeTurnos.
// Lo que el dueño aún no confirmó va entre corchetes «provisional a confirmar».

import MarcoLegal from "./MarcoLegal";
import type { SeccionLegal } from "@/app/facturita/DocumentoLegal";

export default function DocumentoLegal({ titulo, vigencia, secciones }: { titulo: string; vigencia: string; secciones: SeccionLegal[] }) {
  return (
    <MarcoLegal>
      <article className="flex flex-col gap-3 leading-relaxed">
        <h1 className="m-0 text-3xl font-semibold text-strong">{titulo}</h1>
        <p className="m-0 text-sm text-muted">{vigencia}</p>
        {secciones.map((s, i) => (
          <section key={s.titulo} aria-labelledby={`seccion-${i}`} className="mt-6 flex flex-col gap-3">
            <h2 id={`seccion-${i}`} className="m-0 text-xl font-semibold text-strong">
              {i + 1}. {s.titulo}
            </h2>
            {s.parrafos.map((p, j) => (
              <p key={j} className="m-0">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </MarcoLegal>
  );
}
