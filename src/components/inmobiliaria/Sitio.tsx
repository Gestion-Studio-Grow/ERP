// Piezas de servidor del sitio público de la inmobiliaria: el marco (cabecera, pie, WhatsApp),
// la tarjeta de propiedad y el buscador. Sin estado propio: el buscador es un formulario GET,
// así que anda sin JavaScript y cada búsqueda tiene su link para compartir.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  datosClave,
  precioDeCartel,
  TIPO_LABEL,
  TIPOS,
  urlDeBusqueda,
  waLink,
  type Etiqueta,
  type Filtros,
  type Operacion,
} from "@/lib/inmobiliaria/core";
import type { NegocioInmo, TarjetaPropiedad } from "@/lib/inmobiliaria/datos.server";
import type { MarcaInmo } from "@/lib/inmobiliaria/marca";
import s from "./sitio.module.css";

export const estilos = s;

export function Marco({
  negocio,
  marca,
  matricula,
  activa,
  mensajeWhatsApp,
  children,
}: {
  negocio: NegocioInmo;
  marca: MarcaInmo;
  matricula?: string;
  activa?: "inicio" | "venta" | "alquiler" | "tasar";
  mensajeWhatsApp?: string;
  children: ReactNode;
}) {
  const wa = waLink(negocio.whatsapp, mensajeWhatsApp ?? `Hola ${negocio.nombre}! Los contacto desde el sitio.`);
  const variables = { "--acento": marca.acento, "--acento-tinta": marca.acentoTinta, "--tinta": marca.tinta, "--papel": marca.papel } as CSSProperties;
  const item = (clave: typeof activa, href: string, texto: string) => (
    <Link href={href} aria-current={activa === clave ? "page" : undefined}>
      {texto}
    </Link>
  );
  return (
    <div className={s.sitio} style={variables}>
      <header className={s.cabecera}>
        <div className={`${s.ancho} ${s.cabeceraFila}`}>
          <Link href="/inmobiliaria" className={s.marca} aria-label={`${negocio.nombre} — inicio`}>
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca.logo} alt={negocio.nombre} />
            ) : (
              <span className={s.marcaNombre}>{negocio.nombre}</span>
            )}
          </Link>
          <nav className={s.nav} aria-label="Secciones del sitio">
            {item("venta", urlDeBusqueda({ operacion: "venta" }), "Comprar")}
            {item("alquiler", urlDeBusqueda({ operacion: "alquiler" }), "Alquilar")}
            {item("tasar", "/inmobiliaria#tasar", "Tasar mi propiedad")}
            <Link href="/inmobiliaria#contacto">Contacto</Link>
          </nav>
        </div>
      </header>

      <main className={s.principal}>{children}</main>

      <footer className={s.pie} id="contacto">
        <div className={s.ancho}>
          <div className={s.pieGrilla}>
            <div>
              <p className={s.pieNombre}>{negocio.nombre}</p>
              <p>{negocio.lema}</p>
              {matricula && <p>{matricula}</p>}
            </div>
            <div>
              <h2>Dónde estamos</h2>
              <p>{negocio.direccion || "Dirección a confirmar"}</p>
              <p>{negocio.horario}</p>
              {negocio.mapsUrl && (
                <a href={negocio.mapsUrl} target="_blank" rel="noopener noreferrer">
                  Cómo llegar
                </a>
              )}
            </div>
            <div>
              <h2>Hablemos</h2>
              {wa && (
                <p>
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    Escribinos por WhatsApp
                  </a>
                </p>
              )}
              {negocio.email && (
                <p>
                  <a href={`mailto:${negocio.email}`}>{negocio.email}</a>
                </p>
              )}
              {negocio.instagramUrl && (
                <p>
                  <a href={negocio.instagramUrl} target="_blank" rel="noopener noreferrer">
                    {negocio.instagramLabel ?? "Instagram"}
                  </a>
                </p>
              )}
            </div>
            <div>
              <h2>Propiedades</h2>
              <p>
                <Link href={urlDeBusqueda({ operacion: "venta" })}>En venta</Link>
              </p>
              <p>
                <Link href={urlDeBusqueda({ operacion: "alquiler" })}>En alquiler</Link>
              </p>
              <p>
                <Link href="/inmobiliaria#tasar">Quiero tasar la mía</Link>
              </p>
            </div>
          </div>
          <div className={s.pieBase}>
            <span>
              © {new Date().getFullYear()} {negocio.nombre}
            </span>
            <Link href="/admin">Ingreso del equipo</Link>
          </div>
        </div>
      </footer>

      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={`${s.flotante} ${s.noImprimir}`} aria-label="Escribinos por WhatsApp">
          <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.2A8.5 8.5 0 1 1 21 11.5Z" />
          </svg>
          <span>WhatsApp</span>
        </a>
      )}
    </div>
  );
}

export function Carteles({ etiquetas }: { etiquetas: readonly Etiqueta[] }) {
  if (etiquetas.length === 0) return null;
  return (
    <span className={s.etiquetas}>
      {etiquetas.map((e) => (
        <span key={e.clave} className={`${s.etiqueta} ${e.clave === "reservada" ? s.etiquetaReservada : e.clave === "apto-credito" ? s.etiquetaClara : ""}`}>
          {e.texto}
        </span>
      ))}
    </span>
  );
}

export function Tarjeta({ p, operacion, prioridad }: { p: TarjetaPropiedad; operacion?: Operacion | null; prioridad?: boolean }) {
  const cartel = precioDeCartel(p, operacion);
  const tipo = TIPO_LABEL[p.tipo as keyof typeof TIPO_LABEL] ?? "Propiedad";
  return (
    <li className={s.tarjeta}>
      <div className={s.tarjetaFoto}>
        {p.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.foto} alt="" loading={prioridad ? "eager" : "lazy"} decoding="async" />
        ) : (
          <div className={s.sinFoto}>Fotos a pedido</div>
        )}
        <Carteles etiquetas={p.etiquetas} />
        <span className={s.cartel}>
          <span className={s.operacion}>
            {tipo} · {cartel.operacion === "venta" ? "Venta" : "Alquiler"}
          </span>
          <span className={s.precio}>{cartel.texto}</span>
        </span>
      </div>
      <div className={s.tarjetaCuerpo}>
        <h3 className={s.tarjetaTitulo}>
          <Link href={`/propiedades/${p.slug}`}>{p.titulo}</Link>
        </h3>
        <p className={s.zona}>{p.zona || "Zona a consultar"}</p>
        <ul className={s.datos}>
          {datosClave(p).map((d) => (
            <li key={d.clave}>{d.valor}</li>
          ))}
          {p.enVenta && p.enAlquiler && <li>También {cartel.operacion === "venta" ? "se alquila" : "se vende"}</li>}
        </ul>
      </div>
    </li>
  );
}

const AMBIENTES = [1, 2, 3, 4, 5];

export function Buscador({ zonas, filtros, completo }: { zonas: { localidad: string; cantidad: number }[]; filtros?: Partial<Filtros>; completo?: boolean }) {
  const f = filtros ?? {};
  return (
    <form action="/propiedades" method="get" className={`${s.buscador} ${completo ? s.buscadorPlano : ""}`} role="search" aria-label="Buscar propiedades">
      <label className={s.campo}>
        <span>Quiero</span>
        <select name="operacion" defaultValue={f.operacion ?? ""}>
          <option value="">Comprar o alquilar</option>
          <option value="venta">Comprar</option>
          <option value="alquiler">Alquilar</option>
        </select>
      </label>
      <label className={s.campo}>
        <span>Tipo</span>
        <select name="tipo" defaultValue={f.tipo?.toLowerCase() ?? ""}>
          <option value="">Todos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t.toLowerCase()}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className={s.campo}>
        <span>Zona</span>
        <select name="localidad" defaultValue={f.localidad ?? ""}>
          <option value="">Todas</option>
          {zonas.map((z) => (
            <option key={z.localidad} value={z.localidad}>
              {z.localidad} ({z.cantidad})
            </option>
          ))}
        </select>
      </label>
      {completo && (
        <>
          <label className={s.campo}>
            <span>Ambientes</span>
            <select name="ambientes" defaultValue={f.ambientes ? String(f.ambientes) : ""}>
              <option value="">Cualquiera</option>
              {AMBIENTES.map((a) => (
                <option key={a} value={a}>
                  {a} o más
                </option>
              ))}
            </select>
          </label>
          <label className={s.campo}>
            <span>Precio hasta</span>
            <input name="hasta" inputMode="numeric" placeholder="Sin tope" defaultValue={f.precioMax ? f.precioMax.toLocaleString("es-AR") : ""} />
          </label>
          <label className={s.campo}>
            <span>Ordenar</span>
            <select name="orden" defaultValue={f.orden ?? "recientes"}>
              <option value="recientes">Más nuevas</option>
              <option value="precio-asc">Menor precio</option>
              <option value="precio-desc">Mayor precio</option>
            </select>
          </label>
          <label className={s.tilde}>
            <input type="checkbox" name="credito" value="1" defaultChecked={!!f.aptoCredito} />
            Apto crédito
          </label>
        </>
      )}
      <button type="submit" className={s.boton}>
        Buscar
      </button>
    </form>
  );
}
