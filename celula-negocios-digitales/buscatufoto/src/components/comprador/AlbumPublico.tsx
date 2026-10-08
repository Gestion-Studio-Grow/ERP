"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Aviso,
  BarraProgreso,
  Boton,
  BotonLink,
  Dialogo,
  Girador,
  IconoCamara,
  IconoCarrito,
  Insignia,
  Vacio,
} from "@/components/ui";
import { fechaLarga, plata } from "@/lib/dinero";
import { normalizarDorsal } from "@/lib/dorsales";
import { useDatos } from "@/lib/hooks";
import { asegurarMuestras, SLUG_MUESTRA } from "@/lib/muestras";
import { ARCHIVOS_MUESTRA } from "@/lib/muestras-lista";
import { cotizar } from "@/lib/precios";
import { obtenerRepo } from "@/lib/repo";
import type { Album, Fotografo, Medio } from "@/lib/tipos";
import { Buscador } from "./Buscador";
import { Carrito } from "./Carrito";
import s from "./comprador.module.css";
import { Galeria, type EntradaGaleria } from "./Galeria";
import { Miniatura } from "./Miniatura";
import { contarMedios, ETIQUETA_EVENTO, lineasDescuento } from "./textos";
import { useCarrito } from "./useCarrito";
import { Visor } from "./Visor";

interface DatosAlbum {
  album: Album;
  medios: Medio[];
  fotografo: Fotografo | null;
}

/** Una sola preparación de la muestra por pestaña, aunque el álbum se recargue mientras tanto. */
let preparacion: Promise<unknown> | null = null;

/** Álbum público /a/[slug]. Lee de IndexedDB; si es la muestra y falta, la genera en el navegador. */
export function AlbumPublico({ slug }: { slug: string }) {
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [preparando, setPreparando] = useState(false);

  const datos = useDatos<DatosAlbum | null>(
    async () => {
      const repo = obtenerRepo();
      if (preparacion) await preparacion.catch(() => undefined);
      let album = await repo.albumPorSlug(slug);
      if (slug === SLUG_MUESTRA) {
        const faltan = !album || (await repo.mediosDe(album.id)).length < ARCHIVOS_MUESTRA.length;
        if (faltan) {
          setPreparando(true);
          preparacion = asegurarMuestras((hechas, total) => setProgreso({ hechas, total })).finally(() => {
            preparacion = null;
          });
          try {
            await preparacion;
          } finally {
            setPreparando(false);
          }
          album = await repo.albumPorSlug(slug);
        }
      }
      if (!album) return null;
      const [medios, fotografo] = await Promise.all([repo.mediosDe(album.id), repo.obtenerFotografo(album.fotografoId)]);
      return { album, medios, fotografo };
    },
    [slug],
    ["albumes", "medios", "fotografos"],
  );

  if (datos.estado === "cargando") {
    if (preparando) {
      const total = progreso?.total ?? ARCHIVOS_MUESTRA.length;
      const hechas = progreso?.hechas ?? 0;
      return (
        <div className={`contenedor ${s.estado}`}>
          <p className="rotulo">Álbum de muestra</p>
          <h1 className="titulo-l">Preparando el álbum de muestra</h1>
          <p className="bajada">
            La primera vez le ponemos la marca de agua a cada foto acá, en tu navegador. Tarda unos segundos y queda guardado.
          </p>
          <div className={s.barraEstado}>
            <BarraProgreso valor={hechas / total} etiqueta="Progreso de la preparación" />
          </div>
          <p className="mono" aria-live="polite">
            Preparando el álbum de muestra: {hechas} de {total} fotos
          </p>
        </div>
      );
    }
    return (
      <div className={`contenedor ${s.estado}`}>
        <p className={s.estadoFila}>
          <Girador etiqueta="Cargando el álbum" /> Cargando el álbum…
        </p>
      </div>
    );
  }

  if (datos.estado === "error") {
    return (
      <div className={`contenedor ${s.estado}`}>
        <h1 className="titulo-l">No pudimos abrir el álbum</h1>
        <Aviso tono="error">{datos.error}</Aviso>
        <Boton variante="primario" onClick={datos.recargar}>
          Reintentar
        </Boton>
      </div>
    );
  }

  const d = datos.datos;
  if (!d || !d.album.publicado) {
    return (
      <div className={`contenedor ${s.estado}`}>
        <p className="rotulo">Álbum</p>
        <h1 className="titulo-l">Este álbum no existe o se despublicó</h1>
        <p className="bajada">Revisá el enlace que te pasaron. Si lo compartió el fotógrafo hace poco, puede que todavía no esté publicado.</p>
        <BotonLink href="/" variante="primario">
          Ir al inicio
        </BotonLink>
      </div>
    );
  }

  return <AlbumListo key={d.album.id} album={d.album} medios={d.medios} fotografo={d.fotografo} />;
}

function AlbumListo({ album, medios, fotografo }: DatosAlbum) {
  const [numero, setNumero] = useState("");
  const [visorId, setVisorId] = useState<string | null>(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [descuentosAbierto, setDescuentosAbierto] = useState(false);
  const [cupon, setCupon] = useState<string | null>(null);

  const posiciones = useMemo(() => new Map(medios.map((m, i) => [m.id, i])), [medios]);
  const validos = useMemo(() => new Set(posiciones.keys()), [posiciones]);
  const { seleccion, elegidos, alternar, quitar, vaciar } = useCarrito(album.id, validos);

  const dorsal = normalizarDorsal(numero);
  const filtrados = useMemo(() => (dorsal ? medios.filter((m) => m.dorsales.includes(dorsal)) : medios), [medios, dorsal]);
  const entradas: EntradaGaleria[] = useMemo(
    () => filtrados.map((m) => ({ medio: m, indice: posiciones.get(m.id) ?? 0 })),
    [filtrados, posiciones],
  );

  const indiceAlbum = useCallback((id: string) => posiciones.get(id) ?? 0, [posiciones]);
  const estaElegida = useCallback((id: string) => elegidos.has(id), [elegidos]);
  const abrirVisor = useCallback((id: string) => setVisorId(id), []);

  // El visor recorre lo que se está viendo; si la foto abierta salió del filtro, recorre el álbum completo.
  const listaVisor = visorId && filtrados.some((m) => m.id === visorId) ? filtrados : medios;
  const medioSel = useMemo(() => seleccion.map((id) => medios[posiciones.get(id) ?? -1]).filter(Boolean), [seleccion, medios, posiciones]);
  const cot = cotizar(album, medioSel.map((m) => ({ tipo: m.tipo })), cupon, medios.length);

  const portada = album.portadaId ? medios.find((m) => m.id === album.portadaId) : medios.find((m) => m.tipo === "foto");
  const lineas = lineasDescuento(album, medios.length);
  const hayPaquete = album.paquetes.some((p) => p.precio > 0);
  const hayEscalon = album.escalones.some((e) => e.desde > 0 && e.porcentaje > 0);

  return (
    <div className={s.pagina}>
      <section className={`contenedor ${s.cabecera}`} aria-labelledby="titulo-album">
        <div className={s.portada}>
          {portada ? (
            <Miniatura blob={portada.miniatura} alt={`Portada de ${album.nombre}`} ancho={portada.ancho} alto={portada.alto} ansiosa />
          ) : (
            <span className={s.portadaVacia}>
              <IconoCamara />
            </span>
          )}
        </div>
        <div className={s.info}>
          <p className="rotulo">
            {ETIQUETA_EVENTO[album.evento]} · {fechaLarga(album.fecha)}
          </p>
          <h1 id="titulo-album" className="titulo-xl">
            {album.nombre}
          </h1>
          <p className={s.meta}>
            {album.lugar ? <span>{album.lugar}</span> : null}
            {fotografo ? (
              <span>
                Fotos de <Link href={`/f/${fotografo.usuario}`}>{fotografo.nombre}</Link>
              </span>
            ) : null}
          </p>
          {album.descripcion ? <p className="bajada">{album.descripcion}</p> : null}
          <div className={s.precioFila}>
            <span className={s.precio}>
              <span className="rotulo">Precio por foto</span>
              <strong className="mono">{plata(album.precioFoto)}</strong>
            </span>
            {album.precioVideo > 0 && album.precioVideo !== album.precioFoto && medios.some((m) => m.tipo === "video") ? (
              <span className={s.precio}>
                <span className="rotulo">Por video</span>
                <strong className="mono">{plata(album.precioVideo)}</strong>
              </span>
            ) : null}
            {lineas.length ? (
              <span className={s.insignias}>
                {hayPaquete ? (
                  <button type="button" className={s.insigniaBoton} onClick={() => setDescuentosAbierto(true)} aria-haspopup="dialog">
                    <Insignia tono="acento">Paquete disponible</Insignia>
                  </button>
                ) : null}
                {hayEscalon ? (
                  <button type="button" className={s.insigniaBoton} onClick={() => setDescuentosAbierto(true)} aria-haspopup="dialog">
                    <Insignia tono="acento">Descuento por cantidad</Insignia>
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="contenedor" aria-label="Buscar tus fotos">
        <Buscador numero={numero} onNumero={setNumero} />
        <div className={`${s.resultado} ${dorsal && filtrados.length === 0 ? s.resultadoVacio : ""}`}>
          <p role="status" aria-live="polite">
            {dorsal ? (
              filtrados.length ? (
                <>
                  <strong>{contarMedios(filtrados)}</strong> con el <strong className="mono">{dorsal}</strong>
                </>
              ) : (
                <>
                  No encontramos fotos con el <strong className="mono">{dorsal}</strong>. Probá sin ceros adelante o mirá todas.
                </>
              )
            ) : medios.length ? (
              <>{contarMedios(medios)} en el álbum. Escribí tu número para ver sólo las tuyas.</>
            ) : null}
          </p>
          {dorsal ? (
            <Boton tam="chico" onClick={() => setNumero("")}>
              Ver todas
            </Boton>
          ) : null}
        </div>
      </section>

      <section className="contenedor" aria-label="Galería">
        <div className={s.galeriaCabeza}>
          <h2 className="titulo-m">{dorsal ? `Tus fotos con el ${dorsal}` : "Todas las fotos"}</h2>
          {seleccion.length ? (
            <span className="rotulo">
              {seleccion.length} {seleccion.length === 1 ? "elegida" : "elegidas"}
            </span>
          ) : null}
        </div>
        {medios.length === 0 ? (
          <Vacio>
            <p>Todavía no hay fotos en este álbum. El fotógrafo las está subiendo: volvé en un rato.</p>
          </Vacio>
        ) : filtrados.length === 0 ? (
          <Vacio>
            <p>Ninguna foto tiene cargado ese número. A veces el dorsal queda tapado: mirá la galería completa.</p>
            <Boton onClick={() => setNumero("")}>Ver todas las fotos</Boton>
          </Vacio>
        ) : (
          <Galeria entradas={entradas} elegidos={elegidos} dorsalBuscado={dorsal} onAlternar={alternar} onAbrir={abrirVisor} />
        )}
      </section>

      {seleccion.length ? (
        <div className={s.barraCarrito}>
          <div className="contenedor">
            <div className={s.barraCarritoInterior}>
              <span className={s.barraCarritoTexto}>
                <span className="mono">{seleccion.length}</span> {seleccion.length === 1 ? "foto" : "fotos"} ·{" "}
                <strong className="mono">{plata(cot.total)}</strong>
              </span>
              <Boton variante="primario" onClick={() => setCarritoAbierto(true)} aria-haspopup="dialog">
                <IconoCarrito /> Ver carrito
              </Boton>
            </div>
          </div>
        </div>
      ) : null}

      <Visor
        lista={listaVisor}
        actualId={visorId}
        indiceAlbum={indiceAlbum}
        elegida={estaElegida}
        onIr={abrirVisor}
        onAlternar={alternar}
        onCerrar={() => setVisorId(null)}
      />

      <Carrito
        abierto={carritoAbierto}
        onCerrar={() => setCarritoAbierto(false)}
        album={album}
        medios={medios}
        seleccion={medioSel}
        indiceAlbum={indiceAlbum}
        cupon={cupon}
        onCupon={setCupon}
        onQuitar={quitar}
        onVaciar={vaciar}
      />

      <Dialogo abierto={descuentosAbierto} onCerrar={() => setDescuentosAbierto(false)} titulo="Paquetes y descuentos">
        <div className={s.texto}>
          <ul className={s.descuentos}>
            {lineas.map((l) => (
              <li key={l.titulo}>
                <strong>{l.titulo}</strong>
                <span>{l.detalle}</span>
              </li>
            ))}
          </ul>
          <p>
            No tenés que hacer nada: elegís tus fotos y al pagar se aplica sola la opción que más te conviene. Paquete y descuento por
            cantidad no se suman entre sí; un cupón sí se suma encima.
          </p>
        </div>
      </Dialogo>
    </div>
  );
}
