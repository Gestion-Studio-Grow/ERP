import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonLink, IconoFlecha } from "@/components/ui";
import s from "@/components/inicio/paginas.module.css";
import { NOTAS, notaPorSlug, type Bloque } from "@/lib/contenido/blog";
import { fechaLarga } from "@/lib/dinero";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return NOTAS.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const n = notaPorSlug(slug);
  if (!n) return { title: "Nota no encontrada" };
  return {
    title: n.titulo,
    description: n.bajada,
    authors: [{ name: n.autor }],
    openGraph: { type: "article", title: n.titulo, description: n.bajada, publishedTime: n.fecha },
  };
}

function Bloques({ bloques }: { bloques: Bloque[] }) {
  return bloques.map((b, i) => {
    switch (b.tipo) {
      case "p":
        return <p key={i}>{b.texto}</p>;
      case "h2":
        return <h2 key={i}>{b.texto}</h2>;
      case "lista":
        return (
          <ul key={i}>
            {b.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        );
      case "codigo":
        return (
          <pre key={i} className={s.codigo} tabIndex={0} aria-label="Ejemplos de nombres de archivo">
            {b.lineas.join("\n")}
          </pre>
        );
      case "cuenta":
        return (
          <figure key={i} className={s.cuenta} style={{ margin: 0 }}>
            <h3>{b.titulo}</h3>
            <table>
              <tbody>
                {b.filas.map((f) => (
                  <tr key={f.concepto}>
                    <td>{f.concepto}</td>
                    <td className="mono">{f.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {b.nota ? <figcaption className={s.cuentaNota}>{b.nota}</figcaption> : null}
          </figure>
        );
    }
  });
}

export default async function PaginaNota({ params }: Props) {
  const { slug } = await params;
  const nota = notaPorSlug(slug);
  if (!nota) notFound();
  const otras = NOTAS.filter((n) => n.slug !== nota.slug);

  return (
    <div className={`contenedor ${s.pagina}`}>
      <article className={s.hoja}>
        <header className={s.notaCabeza}>
          <p className="rotulo">
            <Link href="/blog">Blog</Link> · <time dateTime={nota.fecha}>{fechaLarga(nota.fecha)}</time> · {nota.minutos}{" "}
            min
          </p>
          <h1 className="titulo-l">{nota.titulo}</h1>
          <p className="bajada">{nota.bajada}</p>
        </header>
        <div className={s.prosa}>
          <Bloques bloques={nota.cuerpo} />
        </div>
        <p className={s.firma}>Por {nota.autor}</p>
      </article>

      <nav className={s.otras} aria-label="Otras notas">
        <p className="rotulo">Seguí leyendo</p>
        {otras.map((n) => (
          <Link key={n.slug} href={`/blog/${n.slug}`} className={s.enlace}>
            {n.titulo}
            <IconoFlecha />
          </Link>
        ))}
        <div style={{ marginTop: 16 }}>
          <BotonLink href="/panel" variante="primario">
            Crear mi álbum
          </BotonLink>
        </div>
      </nav>
    </div>
  );
}
