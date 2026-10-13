import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leerFiltros, tituloDeBusqueda, urlDeBusqueda, type Filtros } from "@/lib/inmobiliaria/core";
import { buscarPropiedades, zonasPublicadas } from "@/lib/inmobiliaria/datos.server";
import { sitioInmo } from "@/lib/inmobiliaria/sitio.server";
import { Buscador, estilos as s, Marco, Tarjeta } from "@/components/inmobiliaria/Sitio";
import { FormConsulta } from "@/components/inmobiliaria/piezas";

// Búsqueda de propiedades. Los filtros viven en la URL: cada búsqueda se puede compartir,
// guardar en favoritos y la encuentra un buscador.
export const dynamic = "force-dynamic";

type Crudo = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Crudo }): Promise<Metadata> {
  const sitio = await sitioInmo();
  if (!sitio) return {};
  const f = leerFiltros(await searchParams);
  const titulo = tituloDeBusqueda(f);
  return {
    title: `${titulo} — ${sitio.negocio.nombre}`,
    description: `${titulo}. Mirá fotos, precios y ubicación, y consultá por WhatsApp. ${sitio.negocio.nombre}, ${sitio.negocio.ciudad || "zona sur"}.`,
    // Las páginas 2 en adelante y las búsquedas por texto no se indexan: repiten contenido.
    robots: f.pagina > 1 || f.texto ? { index: false, follow: true } : undefined,
  };
}

/** Lo que alguien buscó, en palabras, para dejarlo anotado cuando no hay resultados. */
function enPalabras(f: Filtros): string {
  const partes = [tituloDeBusqueda(f)];
  if (f.ambientes) partes.push(`${f.ambientes} ambientes o más`);
  if (f.precioMax) partes.push(`hasta ${f.precioMax.toLocaleString("es-AR")}`);
  if (f.aptoCredito) partes.push("apto crédito");
  if (f.texto) partes.push(`"${f.texto}"`);
  return partes.join(", ");
}

export default async function Propiedades({ searchParams }: { searchParams: Crudo }) {
  const sitio = await sitioInmo();
  if (!sitio) notFound();
  const { tenantId, negocio, marca, config } = sitio;
  const f = leerFiltros(await searchParams);
  const [{ total, paginas, items }, zonas] = await Promise.all([buscarPropiedades(tenantId, f), zonasPublicadas(tenantId)]);
  const titulo = tituloDeBusqueda(f);
  const hayFiltros = urlDeBusqueda({ ...f, pagina: 1, orden: "recientes" }) !== "/propiedades";

  return (
    <Marco negocio={negocio} marca={marca} matricula={config.matricula} activa={f.operacion ?? undefined}>
      <div className={s.ancho}>
        <header className={s.encabezadoPagina}>
          <h1 className={s.h1}>{titulo}</h1>
          <p className={s.contador} role="status">
            {total === 0 ? "No encontramos propiedades con esos filtros." : `${total} ${total === 1 ? "propiedad" : "propiedades"}${paginas > 1 ? ` · página ${f.pagina} de ${paginas}` : ""}`}
            {hayFiltros && (
              <>
                {" · "}
                <Link href="/propiedades">Quitar filtros</Link>
              </>
            )}
          </p>
        </header>

        <Buscador zonas={zonas} filtros={f} completo />

        <section className={s.seccion} style={{ paddingTop: 32 }} aria-label="Resultados">
          {items.length === 0 ? (
            <div className={`${s.caja} ${s.vacio}`}>
              <FormConsulta
                titulo="Hoy no tenemos nada así. ¿Te avisamos cuando entre?"
                bajada="Dejanos tu contacto y te escribimos apenas tengamos una propiedad como la que buscás."
                mensajeInicial={`Busco: ${enPalabras(f)}.`}
                boton="Avisenme"
              />
            </div>
          ) : (
            <>
              <ul className={s.grilla}>
                {items.map((p, i) => (
                  <Tarjeta key={p.id} p={p} operacion={f.operacion} prioridad={i < 3} />
                ))}
              </ul>
              {paginas > 1 && (
                <nav className={s.paginas} aria-label="Páginas de resultados">
                  {f.pagina > 1 && (
                    <Link href={urlDeBusqueda({ ...f, pagina: f.pagina - 1 })} rel="prev">
                      ← Anterior
                    </Link>
                  )}
                  {Array.from({ length: paginas }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === paginas || Math.abs(n - f.pagina) <= 1)
                    .map((n) =>
                      n === f.pagina ? (
                        <span key={n} aria-current="page">
                          {n}
                        </span>
                      ) : (
                        <Link key={n} href={urlDeBusqueda({ ...f, pagina: n })} aria-label={`Página ${n}`}>
                          {n}
                        </Link>
                      ),
                    )}
                  {f.pagina < paginas && (
                    <Link href={urlDeBusqueda({ ...f, pagina: f.pagina + 1 })} rel="next">
                      Siguiente →
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </Marco>
  );
}
