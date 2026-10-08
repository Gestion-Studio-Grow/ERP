import type { Metadata } from "next";
import Link from "next/link";
import { Tarjeta } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";
import { NOTAS } from "@/lib/contenido/blog";
import { fechaLarga } from "@/lib/dinero";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notas prácticas para fotógrafos de eventos: cómo nombrar archivos, cuánto cobrar y cómo usar la marca de agua.",
};

export default function PaginaBlog() {
  const notas = [...NOTAS].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado
        rotulo="Blog"
        titulo="Notas para fotógrafos de eventos"
        bajada="Cosas que sirven el lunes, después de la carrera. Sin cifras de mercado inventadas."
      />
      <ul className={s.notas}>
        {notas.map((n) => (
          <li key={n.slug}>
            <Tarjeta as="article" className={s.nota}>
              <p className={s.meta}>
                <time dateTime={n.fecha}>{fechaLarga(n.fecha)}</time> · {n.minutos} min de lectura
              </p>
              <h2>
                <Link href={`/blog/${n.slug}`}>{n.titulo}</Link>
              </h2>
              <p>{n.bajada}</p>
              <p className={s.meta}>{n.autor}</p>
            </Tarjeta>
          </li>
        ))}
      </ul>
    </div>
  );
}
