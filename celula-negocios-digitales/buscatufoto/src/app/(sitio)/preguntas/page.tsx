import type { Metadata } from "next";
import Link from "next/link";
import { IconoFlecha } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";
import { PREGUNTAS } from "@/lib/contenido/preguntas";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Qué es buscatufoto, cuánto cuesta, cómo se cobra, qué ve el comprador antes de pagar, cómo se busca por número y qué pasa con tus datos.",
};

export default function PaginaPreguntas() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado
        rotulo="Ayuda"
        titulo="Preguntas frecuentes"
        bajada="Lo que más nos preguntan fotógrafos y corredores. Si no está acá, escribinos."
      />
      <div className={s.preguntas}>
        {PREGUNTAS.map((p) => (
          <details key={p.id} id={p.id} className={s.pregunta}>
            <summary>
              <span>{p.pregunta}</span>
              <span className={s.mas} aria-hidden />
            </summary>
            <div className={s.respuesta}>
              {p.respuesta.map((r) => (
                <p key={r}>{r}</p>
              ))}
              {p.enlace ? (
                <p>
                  <Link href={p.enlace.href} className={s.enlace}>
                    {p.enlace.texto}
                    <IconoFlecha />
                  </Link>
                </p>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
