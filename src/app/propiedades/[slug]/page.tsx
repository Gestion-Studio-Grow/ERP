import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { datosClave, descripcionSeo, precio, TIPO_LABEL, TIPO_PLURAL, urlDeBusqueda, waLink, type TipoPropiedad } from "@/lib/inmobiliaria/core";
import { propiedadPublica } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio, sitioInmo } from "@/lib/inmobiliaria/sitio.server";
import { Carteles, estilos as s, Marco, Tarjeta } from "@/components/inmobiliaria/Sitio";
import { Credito, FormConsulta, Galeria } from "@/components/inmobiliaria/piezas";

// Ficha pública de una propiedad. Sólo se ven las publicadas y las reservadas.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function cargar(slug: string) {
  const sitio = await sitioInmo();
  if (!sitio) return null;
  const p = await propiedadPublica(sitio.tenantId, slug);
  return p ? { sitio, p } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const datos = await cargar((await params).slug);
  if (!datos) return {};
  const { sitio, p } = datos;
  const title = `${p.titulo} — ${sitio.negocio.nombre}`;
  const description = descripcionSeo(p);
  const foto = p.fotos[0]?.src;
  return { title, description, openGraph: { title, description, type: "article", locale: "es_AR", ...(foto ? { images: [foto] } : {}) } };
}

export default async function FichaPropiedad({ params }: { params: Params }) {
  const { slug } = await params;
  const datos = await cargar(slug);
  if (!datos) notFound();
  const { sitio, p } = datos;
  const { negocio, marca, config } = sitio;
  const origen = await origenDelSitio();
  const link = `${origen}/propiedades/${p.slug}`;
  const tipo = TIPO_LABEL[p.tipo as TipoPropiedad] ?? "Propiedad";
  const rasgos = datosClave(p);
  const mensaje = `Hola ${negocio.nombre}! Me interesa "${p.titulo}" (cód. ${p.codigo}). ${link}`;
  const wa = waLink(negocio.whatsapp, mensaje);
  const dondeMapa = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : [p.direccion, p.localidad, p.provincia].filter(Boolean).join(", ");
  const mapa = dondeMapa ? `https://www.google.com/maps?q=${encodeURIComponent(dondeMapa)}&z=15&output=embed` : null;
  const reservada = p.estado === "RESERVADA";

  // La ficha para buscadores (schema.org). Sólo lo que ya está a la vista.
  const oferta = (valor: number | null, moneda: string) => (valor ? { "@type": "Offer", price: valor, priceCurrency: moneda, availability: reservada ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock" } : null);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.titulo,
    description: descripcionSeo(p),
    ...(origen ? { url: link } : {}),
    image: p.fotos.slice(0, 6).map((f) => (f.src.startsWith("http") ? f.src : `${origen}${f.src}`)),
    offers: [p.enVenta ? oferta(p.precioVenta, p.monedaVenta) : null, p.enAlquiler ? oferta(p.precioAlquiler, p.monedaAlquiler) : null].filter(Boolean),
    address: { "@type": "PostalAddress", ...(p.direccion ? { streetAddress: p.direccion } : {}), addressLocality: p.localidad, addressRegion: p.provincia, addressCountry: "AR" },
  };

  return (
    <Marco negocio={negocio} marca={marca} matricula={config.matricula} activa={p.enVenta ? "venta" : "alquiler"} mensajeWhatsApp={mensaje}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className={s.ancho}>
        <nav className={s.migas} aria-label="Dónde estás">
          <Link href="/inmobiliaria">Inicio</Link>
          <span aria-hidden>/</span>
          <Link href={urlDeBusqueda({ operacion: p.enVenta ? "venta" : "alquiler" })}>{p.enVenta ? "Venta" : "Alquiler"}</Link>
          <span aria-hidden>/</span>
          <Link href={urlDeBusqueda({ operacion: p.enVenta ? "venta" : "alquiler", tipo: p.tipo as TipoPropiedad })}>{TIPO_PLURAL[p.tipo as TipoPropiedad] ?? tipo}</Link>
          {p.localidad && (
            <>
              <span aria-hidden>/</span>
              <Link href={urlDeBusqueda({ localidad: p.localidad })}>{p.localidad}</Link>
            </>
          )}
        </nav>

        <div style={{ position: "relative", marginTop: 8 }}>
          <Galeria fotos={p.fotos} titulo={p.titulo} />
          <Carteles etiquetas={p.etiquetas} />
        </div>

        <div className={s.ficha}>
          <article>
            <p className={s.sobre} style={{ color: "var(--gris)" }}>
              {tipo} · Cód. {p.codigo}
            </p>
            <h1 className={s.fichaTitulo}>{p.titulo}</h1>
            <p className={s.zona}>{[p.direccion, p.zona].filter(Boolean).join(" · ") || "Zona a consultar"}</p>

            <div className={s.fichaPrecios}>
              {p.enVenta && (
                <p className={s.fichaPrecio} style={{ margin: 0 }}>
                  <small>Venta</small>
                  <strong>{precio(p.precioVenta, p.monedaVenta)}</strong>
                  {p.precioAnterior && p.precioVenta && p.precioAnterior > p.precioVenta && <s aria-label={`Antes ${precio(p.precioAnterior, p.monedaVenta)}`}>{precio(p.precioAnterior, p.monedaVenta)}</s>}
                </p>
              )}
              {p.enAlquiler && (
                <p className={s.fichaPrecio} style={{ margin: 0 }}>
                  <small>Alquiler por mes</small>
                  <strong>{precio(p.precioAlquiler, p.monedaAlquiler)}</strong>
                </p>
              )}
              {p.expensas ? (
                <p className={s.fichaPrecio} style={{ margin: 0 }}>
                  <small>Expensas</small>
                  <strong style={{ fontSize: "1.5rem" }}>{precio(p.expensas, "ARS")}</strong>
                </p>
              ) : null}
            </div>

            {rasgos.length > 0 && (
              <ul className={s.rasgos} aria-label="Datos principales">
                {rasgos.map((r) => {
                  const [numero, ...resto] = r.valor.split(" ");
                  return (
                    <li key={r.clave}>
                      <strong>{numero}</strong>
                      <span>{resto.join(" ")}</span>
                    </li>
                  );
                })}
                {p.antiguedad != null && (
                  <li>
                    <strong>{p.antiguedad === 0 ? "A estrenar" : p.antiguedad}</strong>
                    <span>{p.antiguedad === 0 ? "" : "años"}</span>
                  </li>
                )}
              </ul>
            )}

            {p.descripcion && (
              <>
                <h2 className={s.h3}>Cómo es</h2>
                <p className={s.texto}>{p.descripcion}</p>
              </>
            )}

            {(p.comodidades.length > 0 || p.aptoCredito || p.aptoMascotas) && (
              <>
                <h2 className={s.h3}>Qué tiene</h2>
                <ul className={s.comodidades}>
                  {p.aptoCredito && p.enVenta && <li>Apto crédito</li>}
                  {p.aptoMascotas && <li>Se aceptan mascotas</li>}
                  {p.comodidades.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            )}

            {p.videoUrl && (
              <>
                <h2 className={s.h3}>Video</h2>
                <a href={p.videoUrl} target="_blank" rel="noopener noreferrer" className={s.botonLinea}>
                  Ver el recorrido en video
                </a>
              </>
            )}

            {mapa && (
              <>
                <h2 className={s.h3}>Dónde queda</h2>
                <p className={s.zona} style={{ marginBottom: 12 }}>
                  {p.direccion ? [p.direccion, p.zona].filter(Boolean).join(" · ") : `${p.zona || p.localidad}. La dirección exacta te la pasamos al coordinar la visita.`}
                </p>
                <iframe className={s.mapa} title={`Mapa: ${p.zona || p.localidad}`} src={mapa} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </>
            )}
          </article>

          <aside className={s.lateral} aria-label="Consultar por esta propiedad">
            <div className={s.caja}>
              {reservada && <p className={s.aviso} style={{ margin: "0 0 14px" }}>Está reservada. Si querés, te avisamos si se libera o te mostramos parecidas.</p>}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={`${s.boton} ${s.whatsapp}`} style={{ width: "100%", marginBottom: 18 }}>
                  Consultar por WhatsApp
                </a>
              )}
              <FormConsulta propiedadId={p.id} titulo="¿Te la mostramos?" bajada="Dejanos tu contacto y coordinamos." mensajeInicial={`Hola, me interesa esta propiedad (cód. ${p.codigo}).`} conVisita />
            </div>
            {p.enVenta && p.aptoCredito && p.precioVenta ? (
              <div className={s.caja}>
                <Credito valor={p.precioVenta} moneda={p.monedaVenta} />
              </div>
            ) : null}
          </aside>
        </div>

        {p.parecidas.length > 0 && (
          <section className={s.seccion} aria-labelledby="parecidas">
            <div className={s.encabezado}>
              <div>
                <span className={s.filete} aria-hidden />
                <h2 className={s.h2} id="parecidas">
                  También te puede servir
                </h2>
              </div>
              <Link href={urlDeBusqueda({ operacion: p.enVenta ? "venta" : "alquiler", tipo: p.tipo as TipoPropiedad })} className={s.verTodas}>
                Ver más {TIPO_PLURAL[p.tipo as TipoPropiedad]?.toLowerCase() ?? "propiedades"} →
              </Link>
            </div>
            <ul className={s.grilla}>
              {p.parecidas.map((x) => (
                <Tarjeta key={x.id} p={x} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Marco>
  );
}
