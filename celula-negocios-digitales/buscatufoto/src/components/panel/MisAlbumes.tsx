"use client";

import Link from "next/link";
import { BotonLink, IconoCamara, IconoMas, Insignia, Vacio } from "@/components/ui";
import { fechaLarga, plata } from "@/lib/dinero";
import { useDatos, useUrlBlob } from "@/lib/hooks";
import { obtenerRepo } from "@/lib/repo";
import type { Album } from "@/lib/tipos";
import { Cargando, EVENTOS, Encabezado, ErrorCarga, useFotografo } from "./comunes";
import s from "./panel.module.css";

interface FilaAlbum {
  album: Album;
  fotos: number;
  videos: number;
  portada: Blob | null;
  pedidos: number;
  vendido: number;
}

/** /panel con sesión: los álbumes del fotógrafo. */
export function MisAlbumes() {
  const f = useFotografo();
  const d = useDatos(
    async (): Promise<FilaAlbum[]> => {
      const repo = obtenerRepo();
      const albumes = await repo.albumesDe(f.id);
      return Promise.all(
        albumes.map(async (album) => {
          const [medios, pedidos] = await Promise.all([repo.mediosDe(album.id), repo.pedidosDe(album.id)]);
          const portada = medios.find((m) => m.id === album.portadaId) ?? medios.find((m) => m.tipo === "foto") ?? null;
          return {
            album,
            fotos: medios.filter((m) => m.tipo === "foto").length,
            videos: medios.filter((m) => m.tipo === "video").length,
            portada: portada?.miniatura ?? null,
            pedidos: pedidos.length,
            vendido: pedidos.reduce((t, p) => t + p.cotizacion.total, 0),
          };
        }),
      );
    },
    [f.id],
    ["albumes", "medios", "pedidos"],
  );

  return (
    <>
      <Encabezado
        rotulo={`Hola, ${f.nombre}`}
        titulo="Mis álbumes"
        acciones={
          <BotonLink href="/panel/albumes/nuevo" variante="primario">
            <IconoMas /> Crear álbum
          </BotonLink>
        }
      />
      {d.estado === "cargando" ? <Cargando /> : null}
      {d.estado === "error" ? <ErrorCarga error={d.error} /> : null}
      {d.estado === "listo" && d.datos.length === 0 ? (
        <Vacio>
          <IconoCamara />
          <strong style={{ color: "var(--fg)" }}>Todavía no tenés álbumes.</strong>
          <span>Creá el primero con el nombre del evento y el precio por foto. Después subís las fotos y compartís el enlace.</span>
          <BotonLink href="/panel/albumes/nuevo" variante="primario">
            Crear mi primer álbum
          </BotonLink>
        </Vacio>
      ) : null}
      {d.estado === "listo" && d.datos.length > 0 ? (
        <ul className={s.grillaAlbumes}>
          {d.datos.map((fila) => (
            <TarjetaAlbum key={fila.album.id} fila={fila} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

function TarjetaAlbum({ fila }: { fila: FilaAlbum }) {
  const url = useUrlBlob(fila.portada);
  const { album } = fila;
  return (
    <li className={s.tarjetaAlbum}>
      <Link href={`/panel/albumes/${album.id}`} className={s.tarjetaAlbumEnlace}>
        <div className={s.portada}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista marcada desde un Blob local
            <img src={url} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className={s.portadaVacia}>Sin fotos todavía</span>
          )}
        </div>
        <div className={s.tarjetaAlbumCuerpo}>
          <div className={s.filaInsignias}>
            <Insignia tono={album.publicado ? "ok" : undefined}>{album.publicado ? "Publicado" : "Sin publicar"}</Insignia>
            <Insignia>{EVENTOS[album.evento]}</Insignia>
          </div>
          <h2 className={s.tarjetaAlbumTitulo}>{album.nombre}</h2>
          <p className={s.ayudaChica}>{fechaLarga(album.fecha)}</p>
          <dl className={s.datosAlbum}>
            <div>
              <dt>Fotos</dt>
              <dd className="mono">{fila.fotos}</dd>
            </div>
            <div>
              <dt>Videos</dt>
              <dd className="mono">{fila.videos}</dd>
            </div>
            <div>
              <dt>Ventas</dt>
              <dd className="mono">{fila.pedidos}</dd>
            </div>
            <div>
              <dt>Vendido</dt>
              <dd className="mono">{plata(fila.vendido)}</dd>
            </div>
          </dl>
        </div>
      </Link>
    </li>
  );
}
