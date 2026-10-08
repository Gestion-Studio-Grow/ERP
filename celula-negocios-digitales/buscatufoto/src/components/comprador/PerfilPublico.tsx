"use client";

import Link from "next/link";
import { Aviso, Boton, BotonLink, Girador, IconoCamara, Vacio } from "@/components/ui";
import { fechaLarga } from "@/lib/dinero";
import { useDatos } from "@/lib/hooks";
import { obtenerRepo } from "@/lib/repo";
import type { Album, Fotografo, Medio } from "@/lib/tipos";
import s from "./comprador.module.css";
import { Miniatura } from "./Miniatura";
import { ETIQUETA_EVENTO } from "./textos";

interface DatosPerfil {
  fotografo: Fotografo;
  albumes: { album: Album; portada: Medio | null }[];
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase() || "·";
}

/** "@juan.foto", "juan.foto" o "https://instagram.com/juan.foto" → { usuario, url } */
function instagram(v: string): { usuario: string; url: string } | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const usuario = (m ? m[1] : t.replace(/^@/, "")).replace(/[^A-Za-z0-9._]/g, "");
  if (!usuario) return null;
  return { usuario, url: `https://www.instagram.com/${usuario}/` };
}

/** Perfil público del fotógrafo /f/[usuario]: sólo álbumes publicados. */
export function PerfilPublico({ usuario }: { usuario: string }) {
  const datos = useDatos<DatosPerfil | null>(
    async () => {
      const repo = obtenerRepo();
      const fotografo = await repo.fotografoPorUsuario(usuario);
      if (!fotografo) return null;
      const publicados = (await repo.albumesDe(fotografo.id)).filter((a) => a.publicado);
      const albumes = await Promise.all(
        publicados.map(async (album) => {
          const medios = await repo.mediosDe(album.id);
          const portada = medios.find((m) => m.id === album.portadaId) ?? medios.find((m) => m.tipo === "foto") ?? medios[0] ?? null;
          return { album, portada };
        }),
      );
      return { fotografo, albumes };
    },
    [usuario],
    ["fotografos", "albumes", "medios"],
  );

  if (datos.estado === "cargando") {
    return (
      <div className={`contenedor ${s.estado}`}>
        <p className={s.estadoFila}>
          <Girador etiqueta="Cargando el perfil" /> Cargando el perfil…
        </p>
      </div>
    );
  }
  if (datos.estado === "error") {
    return (
      <div className={`contenedor ${s.estado}`}>
        <h1 className="titulo-l">No pudimos abrir el perfil</h1>
        <Aviso tono="error">{datos.error}</Aviso>
        <Boton variante="primario" onClick={datos.recargar}>
          Reintentar
        </Boton>
      </div>
    );
  }
  if (!datos.datos) {
    return (
      <div className={`contenedor ${s.estado}`}>
        <p className="rotulo">Fotógrafo</p>
        <h1 className="titulo-l">No encontramos a @{usuario}</h1>
        <p className="bajada">Puede que haya cambiado su usuario o que el enlace esté mal escrito.</p>
        <BotonLink href="/" variante="primario">
          Ir al inicio
        </BotonLink>
      </div>
    );
  }

  const { fotografo, albumes } = datos.datos;
  const ig = instagram(fotografo.instagram);

  return (
    <div className={`contenedor ${s.pagina}`}>
      <header className={s.perfil}>
        <span className={s.avatar} aria-hidden>
          {iniciales(fotografo.nombre)}
        </span>
        <div className={s.perfilTexto}>
          <p className="rotulo">Fotógrafo</p>
          <h1 className="titulo-l">{fotografo.nombre}</h1>
          <p className={`mono ${s.usuario}`}>@{fotografo.usuario}</p>
        </div>
        {fotografo.bio || ig ? (
          <div className={s.perfilBio}>
            {fotografo.bio ? <p className="bajada">{fotografo.bio}</p> : null}
            {ig ? (
              <BotonLink href={ig.url} externo tam="chico" aria-label={`Instagram de ${fotografo.nombre}: @${ig.usuario} (se abre en otra pestaña)`}>
                Instagram · <span className="mono">@{ig.usuario}</span>
              </BotonLink>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className={s.bloque} aria-labelledby="titulo-albumes">
        <h2 id="titulo-albumes" className="titulo-m">
          Álbumes
        </h2>
        {albumes.length === 0 ? (
          <Vacio>
            <p>Todavía no publicó álbumes. Cuando suba los de su próximo evento, van a aparecer acá.</p>
          </Vacio>
        ) : (
          <ul className={s.albumes}>
            {albumes.map(({ album, portada }) => (
              <li key={album.id}>
                <Link href={`/a/${album.slug}`} className={s.albumTarjeta}>
                  <span className={s.portada}>
                    {portada ? (
                      <Miniatura blob={portada.miniatura} alt="" ancho={portada.ancho} alto={portada.alto} />
                    ) : (
                      <span className={s.portadaVacia}>
                        <IconoCamara />
                      </span>
                    )}
                  </span>
                  <strong>{album.nombre}</strong>
                  <small>
                    {ETIQUETA_EVENTO[album.evento]} · {fechaLarga(album.fecha)}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
