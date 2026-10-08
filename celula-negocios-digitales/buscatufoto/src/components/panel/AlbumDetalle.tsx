"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSegmentos } from "@/lib/ruta";
import { useState } from "react";
import { Aviso, BotonLink, IconoEnlace, Insignia, Interruptor } from "@/components/ui";
import { fechaLarga } from "@/lib/dinero";
import { useDatos } from "@/lib/hooks";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Fotografo, Medio } from "@/lib/tipos";
import { Cargando, EVENTOS, Encabezado, ErrorCarga, useFotografo } from "./comunes";
import { SeccionDatos } from "./FormAlbum";
import { SeccionColaboradores } from "./SeccionColaboradores";
import { SeccionCompartir } from "./SeccionCompartir";
import { SeccionCupones } from "./SeccionCupones";
import { SeccionFotos } from "./SeccionFotos";
import { SeccionPrecios } from "./SeccionPrecios";
import { SeccionVentas } from "./Ventas";
import s from "./panel.module.css";

export const SECCIONES = [
  { id: "fotos", texto: "Fotos y videos" },
  { id: "datos", texto: "Datos" },
  { id: "precios", texto: "Precios" },
  { id: "cupones", texto: "Cupones" },
  { id: "colaboradores", texto: "Colaboradores" },
  { id: "ventas", texto: "Ventas" },
  { id: "compartir", texto: "Compartir" },
] as const;
type IdSeccion = (typeof SECCIONES)[number]["id"];

/** /panel/albumes/[id] */
export function AlbumDetalle() {
  const f = useFotografo();
  const id = useSegmentos()[2] ?? "_";
  const pedida = useSearchParams().get("seccion");
  const seccion: IdSeccion = SECCIONES.find((x) => x.id === pedida)?.id ?? "fotos";

  const a = useDatos(() => obtenerRepo().obtenerAlbum(id), [id], ["albumes", "medios", "pedidos"]);
  const m = useDatos(() => obtenerRepo().mediosDe(id), [id], ["medios"]);

  if (a.estado === "cargando") return <Cargando texto="Abriendo el álbum…" />;
  if (a.estado === "error") return <ErrorCarga error={a.error} />;
  const album = a.datos;
  if (album && album.id !== id) return <Cargando texto="Abriendo el álbum…" />;
  if (!album) {
    return (
      <>
        <Encabezado titulo="No encontramos el álbum" bajada="Puede que lo hayas eliminado o que el enlace esté mal." />
        <BotonLink href="/panel" variante="primario">
          Volver a mis álbumes
        </BotonLink>
      </>
    );
  }
  if (album.fotografoId !== f.id) {
    return (
      <>
        <Encabezado titulo="Este álbum no es tuyo" bajada="Lo creó otra cuenta de fotógrafo. Desde acá sólo podés manejar tus álbumes." />
        <Aviso tono="error">No tenés permiso para editar este álbum.</Aviso>
        <div className={s.filaBotones}>
          <BotonLink href="/panel" variante="primario">
            Ir a mis álbumes
          </BotonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <Cabecera album={album} cantidad={m.datos?.length ?? 0} />
      <nav className={s.pestanas} aria-label="Secciones del álbum">
        {SECCIONES.map((x) => (
          <Link
            key={x.id}
            href={`/panel/albumes/${album.id}?seccion=${x.id}`}
            scroll={false}
            replace
            className={s.pestana}
            aria-current={x.id === seccion ? "page" : undefined}
          >
            {x.texto}
          </Link>
        ))}
      </nav>
      {m.estado === "error" ? <ErrorCarga error={m.error} /> : null}
      {m.estado === "cargando" ? <Cargando texto="Cargando fotos…" /> : null}
      {m.estado === "listo" ? <Contenido seccion={seccion} album={album} medios={m.datos} fotografo={f} /> : null}
    </>
  );
}

function Contenido({ seccion, album, medios, fotografo }: { seccion: IdSeccion; album: Album; medios: Medio[]; fotografo: Fotografo }) {
  // Cada sección con borrador se monta con la clave del álbum: arranca con lo guardado.
  switch (seccion) {
    case "fotos":
      return <SeccionFotos album={album} medios={medios} fotografo={fotografo} />;
    case "datos":
      return <SeccionDatos key={album.id} album={album} />;
    case "precios":
      return <SeccionPrecios key={album.id} album={album} medios={medios} />;
    case "cupones":
      return <SeccionCupones key={album.id} album={album} medios={medios} />;
    case "colaboradores":
      return <SeccionColaboradores album={album} />;
    case "ventas":
      return <SeccionVentas album={album} />;
    case "compartir":
      return <SeccionCompartir album={album} medios={medios} />;
  }
}

function Cabecera({ album, cantidad }: { album: Album; cantidad: number }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function publicar(v: boolean) {
    setError(null);
    setOcupado(true);
    try {
      await obtenerRepo().actualizarAlbum(album.id, { publicado: v });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <p className={s.migas}>
        <Link href="/panel">Mis álbumes</Link> <span aria-hidden>/</span> <span>{album.nombre}</span>
      </p>
      <Encabezado
        titulo={album.nombre}
        bajada={
          <span className={s.filaInsignias}>
            <Insignia>{EVENTOS[album.evento]}</Insignia>
            <span>{fechaLarga(album.fecha)}</span>
            {album.lugar ? <span>· {album.lugar}</span> : null}
            <span className="mono">
              · {cantidad} {cantidad === 1 ? "archivo" : "archivos"}
            </span>
          </span>
        }
        acciones={
          <>
            <Interruptor etiqueta={album.publicado ? "Publicado" : "Sin publicar"} checked={album.publicado} onChange={publicar} disabled={ocupado} />
            <BotonLink href={`/a/${album.slug}`} externo tam="chico">
              <IconoEnlace /> Ver como comprador
            </BotonLink>
          </>
        }
      />
      {error ? <Aviso tono="error">{error}</Aviso> : null}
    </>
  );
}
