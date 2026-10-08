"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AreaTexto, Aviso, Boton, Dialogo, Entrada, Interruptor, Selector, Tarjeta } from "@/components/ui";
import { aSlug } from "@/lib/ids";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, TipoEvento } from "@/lib/tipos";
import { aEntero, EVENTOS, Encabezado, Seccion, useFotografo, useOrigen } from "./comunes";
import s from "./panel.module.css";

interface Borrador {
  nombre: string;
  evento: TipoEvento;
  lugar: string;
  fecha: string;
  descripcion: string;
  slug: string;
}

function hoyISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Campos comunes de datos del álbum (nombre, evento, lugar, fecha, descripción, enlace). */
function CamposDatos({
  b,
  set,
  slugVisible,
  onSlug,
  ayudaSlug,
}: {
  b: Borrador;
  set: (c: Partial<Borrador>) => void;
  slugVisible: string;
  onSlug: (v: string) => void;
  ayudaSlug: string;
}) {
  const origen = useOrigen();
  return (
    <>
      <Entrada etiqueta="Nombre del álbum" value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Ej.: 10K de la Costanera 2026" required />
      <div className={s.grilla2}>
        <Selector etiqueta="Tipo de evento" value={b.evento} onChange={(e) => set({ evento: e.target.value as TipoEvento })}>
          {(Object.keys(EVENTOS) as TipoEvento[]).map((k) => (
            <option key={k} value={k}>
              {EVENTOS[k]}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Fecha del evento" type="date" value={b.fecha} onChange={(e) => set({ fecha: e.target.value })} required />
      </div>
      <Entrada etiqueta="Lugar" value={b.lugar} onChange={(e) => set({ lugar: e.target.value })} placeholder="Ej.: Costanera Sur, CABA" />
      <AreaTexto
        etiqueta="Descripción"
        value={b.descripcion}
        onChange={(e) => set({ descripcion: e.target.value })}
        placeholder="Contale a la gente qué hay en el álbum y cómo buscarse."
        rows={3}
      />
      <Entrada
        etiqueta="Enlace del álbum"
        value={slugVisible}
        onChange={(e) => onSlug(e.target.value)}
        className={s.campoMono}
        spellCheck={false}
        autoCapitalize="off"
        ayuda={
          <>
            Queda así: <span className="mono">{origen}/a/{aSlug(slugVisible) || "…"}</span>. {ayudaSlug}
          </>
        }
      />
    </>
  );
}

/** /panel/albumes/nuevo */
export function NuevoAlbum() {
  const f = useFotografo();
  const router = useRouter();
  const [b, setB] = useState<Borrador>(() => ({ nombre: "", evento: "carrera", lugar: "", fecha: hoyISO(), descripcion: "", slug: "" }));
  const [slugTocado, setSlugTocado] = useState(false);
  const [precioFoto, setPrecioFoto] = useState("3500");
  const [precioVideo, setPrecioVideo] = useState("0");
  const [publicado, setPublicado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const slugVisible = slugTocado ? b.slug : aSlug(b.nombre);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const pf = aEntero(precioFoto);
    const pv = precioVideo.trim() === "" ? 0 : aEntero(precioVideo);
    if (!Number.isFinite(pf)) return setError("Poné el precio por foto en pesos, sin centavos (ej.: 3500).");
    if (!Number.isFinite(pv)) return setError("El precio por video va en pesos, sin centavos. Dejalo en 0 para cobrarlo igual que una foto.");
    setOcupado(true);
    try {
      const a = await obtenerRepo().crearAlbum(f.id, {
        nombre: b.nombre,
        evento: b.evento,
        lugar: b.lugar.trim(),
        fecha: b.fecha,
        descripcion: b.descripcion.trim(),
        slug: slugVisible || undefined,
        precioFoto: pf,
        precioVideo: pv,
        paquetes: [],
        escalones: [],
        cupones: [],
        colaboradores: [],
        publicado,
      });
      router.push(`/panel/albumes/${a.id}?seccion=fotos`);
    } catch (err) {
      setError(mensajeDeError(err));
      setOcupado(false);
    }
  }

  return (
    <>
      <Encabezado rotulo="Nuevo" titulo="Crear álbum" bajada="Los datos básicos y el precio. Paquetes, descuentos, cupones y colaboradores los configurás en el álbum, después de crearlo." />
      <Tarjeta as="section" className={s.tarjetaForm}>
        <form className={s.formulario} onSubmit={crear} noValidate>
          <CamposDatos
            b={b}
            set={(c) => setB((x) => ({ ...x, ...c }))}
            slugVisible={slugVisible}
            onSlug={(v) => {
              setSlugTocado(true);
              setB((x) => ({ ...x, slug: v }));
            }}
            ayudaSlug="Si ya existe, le agregamos un número al final."
          />
          <div className={s.grilla2}>
            <Entrada etiqueta="Precio por foto (ARS)" inputMode="numeric" value={precioFoto} onChange={(e) => setPrecioFoto(e.target.value)} required />
            <Entrada
              etiqueta="Precio por video (ARS)"
              inputMode="numeric"
              value={precioVideo}
              onChange={(e) => setPrecioVideo(e.target.value)}
              ayuda="0 = lo mismo que una foto."
            />
          </div>
          <Interruptor etiqueta="Publicado: cualquiera con el enlace puede verlo" checked={publicado} onChange={setPublicado} />
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
          <div className={s.filaBotones}>
            <Boton type="submit" variante="primario" disabled={ocupado}>
              {ocupado ? "Creando…" : "Crear álbum y subir fotos"}
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}

function desdeAlbum(a: Album): Borrador {
  return { nombre: a.nombre, evento: a.evento, lugar: a.lugar, fecha: a.fecha, descripcion: a.descripcion, slug: a.slug };
}

/** Sección "Datos" del álbum: editar y eliminar. */
export function SeccionDatos({ album }: { album: Album }) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(() => desdeAlbum(album));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  const cambiado = JSON.stringify(b) !== JSON.stringify(desdeAlbum(album));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setOcupado(true);
    try {
      const a = await obtenerRepo().actualizarAlbum(album.id, {
        nombre: b.nombre.trim(),
        evento: b.evento,
        lugar: b.lugar.trim(),
        fecha: b.fecha,
        descripcion: b.descripcion.trim(),
        slug: b.slug,
      });
      setB(desdeAlbum(a));
      setOk(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar() {
    setErrorBorrar(null);
    try {
      await obtenerRepo().eliminarAlbum(album.id);
      router.push("/panel");
    } catch (err) {
      setErrorBorrar(mensajeDeError(err));
    }
  }

  return (
    <>
      <Seccion titulo="Datos del álbum" bajada="Lo que ve la gente arriba de la galería.">
        <form className={s.formulario} onSubmit={guardar} noValidate>
          <CamposDatos
            b={b}
            set={(c) => {
              setOk(false);
              setB((x) => ({ ...x, ...c }));
            }}
            slugVisible={b.slug}
            onSlug={(v) => {
              setOk(false);
              setB((x) => ({ ...x, slug: v }));
            }}
            ayudaSlug="Si lo cambiás, el enlace viejo deja de andar."
          />
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
          {ok ? <Aviso tono="ok">Guardado.</Aviso> : null}
          <div className={s.filaBotones}>
            <Boton type="submit" variante="primario" disabled={ocupado || !cambiado}>
              {ocupado ? "Guardando…" : "Guardar datos"}
            </Boton>
            {cambiado ? (
              <Boton variante="fantasma" onClick={() => setB(desdeAlbum(album))}>
                Descartar cambios
              </Boton>
            ) : null}
          </div>
        </form>
      </Seccion>

      <Seccion titulo="Eliminar álbum" bajada="Se borran las fotos, los videos y los originales de este navegador. Si el álbum ya tiene ventas no se puede borrar: despublicalo, así quien compró sigue descargando.">
        <div>
          <Boton variante="peligro" onClick={() => setBorrar(true)}>
            Eliminar este álbum
          </Boton>
        </div>
      </Seccion>

      <Dialogo
        abierto={borrar}
        onCerrar={() => setBorrar(false)}
        titulo="¿Eliminar el álbum?"
        pie={
          <div className={s.filaBotones}>
            <Boton variante="peligro" onClick={eliminar}>
              Sí, eliminar “{album.nombre}”
            </Boton>
            <Boton variante="fantasma" onClick={() => setBorrar(false)}>
              Cancelar
            </Boton>
          </div>
        }
      >
        <p>
          Vas a borrar <strong>{album.nombre}</strong> con todas sus fotos y videos. No se puede deshacer. Si ya tiene ventas, no te vamos a dejar
          borrarlo: quien compró tiene que poder seguir descargando.
        </p>
        {errorBorrar ? (
          <p role="alert" className={s.error}>
            {errorBorrar}
          </p>
        ) : null}
      </Dialogo>
    </>
  );
}

