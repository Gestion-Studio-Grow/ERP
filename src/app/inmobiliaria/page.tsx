import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TIPO_PLURAL, urlDeBusqueda } from "@/lib/inmobiliaria/core";
import { numerosPublicos, propiedadesDePortada, zonasPublicadas } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio, sitioInmo } from "@/lib/inmobiliaria/sitio.server";
import { Buscador, estilos as s, Marco, Tarjeta } from "@/components/inmobiliaria/Sitio";
import { FormConsulta } from "@/components/inmobiliaria/piezas";

// Portada del sitio de una inmobiliaria: buscador, destacadas, zonas y pedido de tasación.
// Sólo existe para negocios del rubro `inmobiliaria`; el resto recibe la "no encontrada".
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const sitio = await sitioInmo();
  if (!sitio) return {};
  const { negocio, marca } = sitio;
  const donde = negocio.ciudad || "tu zona";
  const description = `${marca.bajada} Propiedades en venta y alquiler en ${donde}. ${negocio.direccion}.`.trim();
  return {
    title: `${negocio.nombre} — Inmobiliaria en ${donde}`,
    description,
    openGraph: { title: `${negocio.nombre} — Inmobiliaria en ${donde}`, description, type: "website", locale: "es_AR", ...(marca.portada ? { images: [marca.portada] } : {}) },
  };
}

export default async function InmobiliariaInicio() {
  const sitio = await sitioInmo();
  if (!sitio) notFound();
  const { tenantId, negocio, marca, config } = sitio;
  const [destacadas, zonas, numeros, origen] = await Promise.all([propiedadesDePortada(tenantId, 6), zonasPublicadas(tenantId), numerosPublicos(tenantId), origenDelSitio()]);
  const portada = marca.portada ?? destacadas.find((p) => p.foto)?.foto ?? null;
  const tipos = [...new Set(destacadas.map((p) => p.tipo))].slice(0, 3);
  const anios = marca.desde ? new Date().getFullYear() - marca.desde : null;

  // Datos del negocio para buscadores (schema.org). Sólo lo que ya está a la vista en la página.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: negocio.nombre,
    description: marca.bajada,
    ...(origen ? { url: `${origen}/inmobiliaria` } : {}),
    ...(negocio.calle ? { address: { "@type": "PostalAddress", streetAddress: negocio.calle, addressLocality: negocio.ciudad, addressCountry: "AR" } } : {}),
    ...(negocio.whatsapp ? { telephone: `+${negocio.whatsapp}` } : {}),
    areaServed: zonas.slice(0, 8).map((z) => z.localidad),
  };

  return (
    <Marco negocio={negocio} marca={marca} matricula={config.matricula} activa="inicio">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <section className={s.hero} aria-label="Buscá tu propiedad">
        {portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.heroFoto} src={portada} alt="" fetchPriority="high" />
        )}
        <div className={`${s.ancho} ${s.heroCuerpo}`}>
          <p className={s.sobre}>
            Inmobiliaria{negocio.ciudad ? ` en ${negocio.ciudad}` : ""}
            {marca.desde ? ` · desde ${marca.desde}` : ""}
          </p>
          <h1 className={s.heroTitulo}>{marca.lema}</h1>
          <p className={s.heroBajada}>{marca.bajada}</p>
          <Buscador zonas={zonas} />
          <div className={s.atajos}>
            {tipos.map((t) => (
              <Link key={t} href={urlDeBusqueda({ tipo: t as keyof typeof TIPO_PLURAL })} className={s.atajo}>
                {TIPO_PLURAL[t as keyof typeof TIPO_PLURAL] ?? t}
              </Link>
            ))}
            <Link href={urlDeBusqueda({ aptoCredito: true, operacion: "venta" })} className={s.atajo}>
              Apto crédito
            </Link>
            <Link href="/propiedades" className={s.atajo}>
              Ver todo
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="La inmobiliaria en números">
        <div className={s.ancho}>
          <div className={s.numeros}>
            <div className={s.numero}>
              <strong>{numeros.venta}</strong>
              <span>propiedades en venta</span>
            </div>
            <div className={s.numero}>
              <strong>{numeros.alquiler}</strong>
              <span>en alquiler</span>
            </div>
            <div className={s.numero}>
              <strong>{zonas.length}</strong>
              <span>{zonas.length === 1 ? "zona" : "zonas"} donde trabajamos</span>
            </div>
            {anios != null && anios > 0 && (
              <div className={s.numero}>
                <strong>{anios}</strong>
                <span>años en el barrio</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={s.seccion} aria-labelledby="destacadas">
        <div className={s.ancho}>
          <div className={s.encabezado}>
            <div>
              <span className={s.filete} aria-hidden />
              <h2 className={s.h2} id="destacadas">
                Para ver esta semana
              </h2>
              <p className={s.bajada}>Las que elegimos nosotros y las últimas que entraron.</p>
            </div>
            <Link href="/propiedades" className={s.verTodas}>
              Ver todas las propiedades →
            </Link>
          </div>
          {destacadas.length === 0 ? (
            <p className={s.bajada}>Estamos cargando las propiedades. Mientras tanto, escribinos y te contamos qué tenemos.</p>
          ) : (
            <ul className={s.grilla}>
              {destacadas.map((p, i) => (
                <Tarjeta key={p.id} p={p} prioridad={i < 3} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {zonas.length > 0 && (
        <section className={`${s.seccion} ${s.seccionOscura}`} aria-labelledby="zonas">
          <div className={s.ancho}>
            <div className={s.encabezado}>
              <div>
                <span className={s.filete} aria-hidden />
                <h2 className={s.h2} id="zonas">
                  Dónde trabajamos
                </h2>
                <p className={s.bajada}>Elegí la zona y mirá lo que hay publicado hoy.</p>
              </div>
            </div>
            <ul className={s.zonas}>
              {zonas.map((z) => (
                <li key={z.localidad}>
                  <Link href={urlDeBusqueda({ localidad: z.localidad })} className={s.zonaItem}>
                    {z.localidad}
                    <small>
                      {z.cantidad} {z.cantidad === 1 ? "propiedad" : "propiedades"}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className={`${s.seccion} ${s.seccionSuave}`} id="tasar" aria-labelledby="tasar-titulo">
        <div className={`${s.ancho} ${s.dos}`}>
          <div>
            <span className={s.filete} aria-hidden />
            <h2 className={s.h2} id="tasar-titulo">
              ¿Querés vender o alquilar la tuya?
            </h2>
            <p className={s.bajada}>La tasamos sin cargo y te decimos en cuánto se puede publicar para que se mueva, no para que quede colgada.</p>
            <ol className={s.pasos}>
              <li>
                <div>
                  <strong>Nos contás qué tenés</strong>
                  <span>Dejanos tu contacto y te llamamos en el día para coordinar.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>La vemos y la tasamos</strong>
                  <span>Con lo que se vendió y se alquiló de verdad en tu cuadra, no con precios de aviso.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>La publicamos bien</strong>
                  <span>Fotos, ficha completa y respuesta rápida a cada consulta. Vos seguís todo desde el celular.</span>
                </div>
              </li>
            </ol>
          </div>
          <div className={s.caja}>
            <FormConsulta tipo="TASACION" titulo="Pedí tu tasación sin cargo" bajada="Contanos qué propiedad es y dónde queda." boton="Quiero que me llamen" />
          </div>
        </div>
      </section>
    </Marco>
  );
}
