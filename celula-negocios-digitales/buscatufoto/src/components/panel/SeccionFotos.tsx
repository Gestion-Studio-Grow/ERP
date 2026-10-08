"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  Aviso,
  BarraProgreso,
  Boton,
  Dialogo,
  Entrada,
  IconoBasura,
  IconoSubir,
  Insignia,
  Interruptor,
  Segmentado,
  Vacio,
} from "@/components/ui";
import { pesoLegible } from "@/lib/dinero";
import { dorsalesDesdeNombre, parsearListaDorsales } from "@/lib/dorsales";
import { useUrlBlob } from "@/lib/hooks";
import { nuevoId } from "@/lib/ids";
import { PESO_MAX_FOTO, PESO_MAX_VIDEO, procesarArchivo, TIPOS_ACEPTADOS, tipoDeArchivo } from "@/lib/marca-agua";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Fotografo, MarcaAgua, Medio } from "@/lib/tipos";
import { Seccion } from "./comunes";
import { rehacerMarcas } from "./rehacer";
import s from "./panel.module.css";

const ACEPTADOS = TIPOS_ACEPTADOS.split(",");

function validarArchivo(f: File): string | null {
  const tipo = tipoDeArchivo(f);
  if (!tipo || !ACEPTADOS.includes(f.type)) return "Formato no soportado. Subí JPG, PNG, WebP, MP4, WebM o MOV.";
  const max = tipo === "foto" ? PESO_MAX_FOTO : PESO_MAX_VIDEO;
  if (f.size > max) return `Pesa ${pesoLegible(f.size)}; el máximo para ${tipo === "foto" ? "fotos" : "videos"} es ${pesoLegible(max)}.`;
  if (f.size === 0) return "El archivo está vacío.";
  return null;
}

export function SeccionFotos({ album, medios, fotografo }: { album: Album; medios: Medio[]; fotografo: Fotografo }) {
  return (
    <>
      <Subida album={album} fotografo={fotografo} />
      <Grilla album={album} medios={medios} fotografo={fotografo} />
    </>
  );
}

/* ---------- Subida ---------- */

type EstadoItem = "espera" | "procesando" | "listo" | "error";
interface ItemCola {
  id: string;
  nombre: string;
  estado: EstadoItem;
  error: string | null;
}
interface Pendiente {
  id: string;
  archivo: File;
  marca: MarcaAgua;
  desdeNombre: boolean;
}

function Subida({ album, fotografo }: { album: Album; fotografo: Fotografo }) {
  const [items, setItems] = useState<ItemCola[]>([]);
  const [desdeNombre, setDesdeNombre] = useState(true);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pendientes = useRef<Pendiente[]>([]);
  const corriendo = useRef(false);
  const albumId = album.id;

  const total = items.length;
  const terminados = items.filter((i) => i.estado === "listo" || i.estado === "error").length;
  const actual = items.find((i) => i.estado === "procesando");
  const activo = items.some((i) => i.estado === "espera" || i.estado === "procesando");
  const conError = items.filter((i) => i.estado === "error");
  const listos = items.filter((i) => i.estado === "listo").length;

  // Avisar antes de cerrar la pestaña con la cola a medio procesar.
  useEffect(() => {
    if (!activo) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [activo]);

  const marcar = (id: string, cambio: Partial<ItemCola>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...cambio } : x)));

  async function procesarCola() {
    if (corriendo.current) return;
    corriendo.current = true;
    const repo = obtenerRepo();
    while (pendientes.current.length) {
      const p = pendientes.current.shift()!;
      marcar(p.id, { estado: "procesando" });
      try {
        const procesado = await procesarArchivo(p.archivo, p.marca);
        await repo.agregarMedio(albumId, {
          original: p.archivo,
          nombreArchivo: p.archivo.name,
          dorsales: p.desdeNombre ? dorsalesDesdeNombre(p.archivo.name) : [],
          ...procesado,
        });
        marcar(p.id, { estado: "listo" });
      } catch (e) {
        marcar(p.id, { estado: "error", error: mensajeDeError(e) });
      }
    }
    corriendo.current = false;
  }

  function agregar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const nuevos: ItemCola[] = [];
    for (const archivo of Array.from(lista)) {
      const id = nuevoId("c_");
      const error = validarArchivo(archivo);
      nuevos.push({ id, nombre: archivo.name, estado: error ? "error" : "espera", error });
      if (!error) pendientes.current.push({ id, archivo, marca: fotografo.marca, desdeNombre });
    }
    // Si la cola anterior terminó, arrancamos una lista nueva para que el contador sea claro.
    setItems((l) => (l.some((i) => i.estado === "espera" || i.estado === "procesando") ? [...l, ...nuevos] : nuevos));
    void procesarCola();
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    agregar(e.dataTransfer.files);
  }

  return (
    <Seccion titulo="Subir fotos y videos" bajada="La marca de agua se pone en tu navegador al subir. El original queda guardado aparte y sólo lo descarga quien paga.">
      <div
        className={s.zonaSoltar}
        data-arrastrando={arrastrando}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!arrastrando) setArrastrando(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setArrastrando(false);
        }}
        onDrop={soltar}
      >
        <IconoSubir />
        <p>
          <strong>Arrastrá las fotos y los videos acá</strong>
          <br />
          <span className={s.ayudaChica}>
            JPG, PNG, WebP hasta {pesoLegible(PESO_MAX_FOTO)} · MP4, WebM o MOV hasta {pesoLegible(PESO_MAX_VIDEO)}
          </span>
        </p>
        <Boton variante="primario" onClick={() => input.current?.click()}>
          Elegir archivos
        </Boton>
        <input
          ref={input}
          type="file"
          multiple
          accept={TIPOS_ACEPTADOS}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            agregar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className={s.opcionDorsal}>
        <Interruptor etiqueta="Tomar el dorsal del nombre del archivo" checked={desdeNombre} onChange={setDesdeNombre} />
        <p className={s.ayudaChica}>
          Leemos el número si el nombre lo marca con <span className="mono">d</span>, <span className="mono">n</span>,{" "}
          <span className="mono">nro</span>, <span className="mono">dorsal</span> o <span className="mono">#</span> (ej.:{" "}
          <span className="mono">BTF_1201_d73-d4471.jpg</span> → 73 y 4471), o si el nombre son sólo números (
          <span className="mono">1043-318.jpg</span> → 1043 y 318). La numeración de la cámara (<span className="mono">IMG_4021</span>,{" "}
          <span className="mono">DSC_0001</span>) no se toma. Después podés corregir a mano cada foto.
        </p>
      </div>

      {total > 0 ? (
        <div className={s.cola} aria-live="polite">
          <BarraProgreso valor={total ? terminados / total : 0} etiqueta="Progreso de la subida" />
          <p className={`mono ${s.colaEstado}`}>
            {activo
              ? `Procesando ${Math.min(terminados + 1, total)} de ${total}${actual ? ` · ${actual.nombre}` : ""}`
              : `Listo: ${listos} ${listos === 1 ? "subida" : "subidas"}${conError.length ? `, ${conError.length} con error` : ""}.`}
          </p>
          {activo ? <p className={s.ayudaChica}>No cierres esta pestaña hasta que termine.</p> : null}
          {conError.length ? (
            <ul className={s.colaErrores} role="alert">
              {conError.map((i) => (
                <li key={i.id}>
                  <span className="mono">{i.nombre}</span>: {i.error}
                </li>
              ))}
            </ul>
          ) : null}
          {!activo ? (
            <div>
              <Boton variante="fantasma" tam="chico" onClick={() => setItems([])}>
                Limpiar la lista
              </Boton>
            </div>
          ) : null}
        </div>
      ) : null}
    </Seccion>
  );
}

/* ---------- Grilla ---------- */

type Filtro = "todas" | "sin";

function Grilla({ album, medios, fotografo }: { album: Album; medios: Medio[]; fotografo: Fotografo }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [aBorrar, setABorrar] = useState<Medio | null>(null);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [rehacer, setRehacer] = useState<{ hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const sinDorsal = medios.filter((m) => m.dorsales.length === 0).length;
  const visibles = filtro === "sin" ? medios.filter((m) => m.dorsales.length === 0) : medios;
  const rehaciendo = rehacer !== null && rehacer.hechas < rehacer.total;

  async function rehacerTodas() {
    setResultado(null);
    const r = await rehacerMarcas(
      medios.map((m) => m.id),
      fotografo.id,
      fotografo.marca,
      (hechas, total) => setRehacer({ hechas, total }),
    );
    setRehacer(null);
    setResultado(r.errores ? `Marcas rehechas: ${r.ok}. No se pudieron rehacer ${r.errores}.` : `Listo: rehicimos la marca de ${r.ok} archivos.`);
  }

  async function confirmarBorrado() {
    if (!aBorrar) return;
    setErrorBorrar(null);
    try {
      await obtenerRepo().eliminarMedio(aBorrar.id);
      setABorrar(null);
    } catch (e) {
      setErrorBorrar(mensajeDeError(e));
    }
  }

  async function usarDePortada(m: Medio) {
    setErrorGeneral(null);
    try {
      await obtenerRepo().actualizarAlbum(album.id, { portadaId: m.id });
    } catch (e) {
      setErrorGeneral(mensajeDeError(e));
    }
  }

  return (
    <Seccion
      titulo={`Fotos y videos del álbum (${medios.length})`}
      bajada="Así las ve la gente: con tu marca de agua. Etiquetá los dorsales para que cada uno se encuentre por su número."
      acciones={
        medios.length ? (
          <Boton variante="secundario" tam="chico" onClick={rehacerTodas} disabled={rehaciendo}>
            Rehacer marcas de agua
          </Boton>
        ) : null
      }
    >
      {rehacer ? (
        <div className={s.cola} aria-live="polite">
          <BarraProgreso valor={rehacer.total ? rehacer.hechas / rehacer.total : 0} etiqueta="Rehaciendo marcas de agua" />
          <p className={`mono ${s.colaEstado}`}>
            Rehaciendo marcas: {rehacer.hechas} de {rehacer.total}
          </p>
        </div>
      ) : null}
      {resultado ? <Aviso tono="ok">{resultado}</Aviso> : null}
      {errorGeneral ? <Aviso tono="error">{errorGeneral}</Aviso> : null}

      {medios.length === 0 ? (
        <Vacio>
          <strong style={{ color: "var(--fg)" }}>El álbum está vacío.</strong>
          <span>Subí las fotos arriba: la marca de agua se pone sola.</span>
        </Vacio>
      ) : (
        <>
          <div className={s.filaFiltros}>
            <Segmentado<Filtro>
              etiqueta="Filtrar fotos"
              valor={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: "todas", texto: `Todas (${medios.length})` },
                { valor: "sin", texto: `Sin dorsal (${sinDorsal})` },
              ]}
            />
          </div>
          {visibles.length === 0 ? (
            <Aviso tono="ok">Todas las fotos tienen al menos un dorsal.</Aviso>
          ) : (
            <ul className={s.grillaMedios}>
              {visibles.map((m) => (
                <TarjetaMedio
                  key={`${m.id}:${m.dorsales.join(",")}`}
                  medio={m}
                  esPortada={album.portadaId === m.id}
                  onPortada={() => usarDePortada(m)}
                  onBorrar={() => {
                    setErrorBorrar(null);
                    setABorrar(m);
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <Dialogo
        abierto={aBorrar !== null}
        onCerrar={() => setABorrar(null)}
        titulo="¿Eliminar este archivo?"
        pie={
          <div className={s.filaBotones}>
            <Boton variante="peligro" onClick={confirmarBorrado}>
              Sí, eliminar
            </Boton>
            <Boton variante="fantasma" onClick={() => setABorrar(null)}>
              Cancelar
            </Boton>
          </div>
        }
      >
        <p>
          Se borra <span className="mono">{aBorrar?.nombreArchivo}</span> del álbum, con su original. Si alguien ya la compró, no la va a poder volver a
          descargar.
        </p>
        {errorBorrar ? (
          <p role="alert" className={s.error}>
            {errorBorrar}
          </p>
        ) : null}
      </Dialogo>
    </Seccion>
  );
}

function TarjetaMedio({
  medio,
  esPortada,
  onPortada,
  onBorrar,
}: {
  medio: Medio;
  esPortada: boolean;
  onPortada: () => void;
  onBorrar: () => void;
}) {
  const url = useUrlBlob(medio.miniatura);
  const [texto, setTexto] = useState(medio.dorsales.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cambiado = parsearListaDorsales(texto).join(",") !== medio.dorsales.join(",");

  async function guardar(dorsales: string[]) {
    setError(null);
    setOcupado(true);
    try {
      await obtenerRepo().actualizarDorsales(medio.id, dorsales);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (cambiado) void guardar(parsearListaDorsales(texto));
  }

  function leerDelNombre() {
    const d = dorsalesDesdeNombre(medio.nombreArchivo);
    if (!d.length) {
      setError("El nombre de este archivo no trae dorsales.");
      return;
    }
    setTexto(d.join(", "));
    void guardar(d);
  }

  return (
    <li className={s.tarjetaMedio}>
      <div className={s.miniatura}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura marcada desde un Blob local
          <img src={url} alt={`Vista marcada de ${medio.nombreArchivo}`} loading="lazy" decoding="async" />
        ) : null}
        <div className={s.miniaturaInsignias}>
          {medio.tipo === "video" ? <Insignia>Video{medio.duracion ? ` · ${medio.duracion} s` : ""}</Insignia> : null}
          {esPortada ? <Insignia tono="acento">Portada</Insignia> : null}
        </div>
      </div>
      <div className={s.tarjetaMedioCuerpo}>
        <p className={`mono ${s.nombreArchivo}`} title={medio.nombreArchivo}>
          {medio.nombreArchivo}
        </p>
        <form onSubmit={enviar} className={s.formDorsal}>
          <Entrada
            etiqueta="Dorsales"
            className={s.campoMono}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
            placeholder="Ej.: 73, 4471"
            autoComplete="off"
            spellCheck={false}
            error={error}
            aria-label={`Dorsales de ${medio.nombreArchivo}`}
          />
          <Boton type="submit" tam="chico" variante={cambiado ? "primario" : "secundario"} disabled={!cambiado || ocupado}>
            Guardar
          </Boton>
        </form>
        <div className={s.accionesMedio}>
          <Boton tam="chico" variante="fantasma" onClick={leerDelNombre} disabled={ocupado}>
            Leer del nombre
          </Boton>
          {medio.tipo === "foto" && !esPortada ? (
            <Boton tam="chico" variante="fantasma" onClick={onPortada}>
              Usar de portada
            </Boton>
          ) : null}
          <Boton tam="chico" variante="fantasma" icono aria-label={`Eliminar ${medio.nombreArchivo}`} title="Eliminar" onClick={onBorrar}>
            <IconoBasura />
          </Boton>
        </div>
      </div>
    </li>
  );
}
