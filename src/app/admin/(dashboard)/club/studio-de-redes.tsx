"use client";

// ============================================================================
// STUDIO DE REDES — la placa para Instagram/WhatsApp con la marca del club, el caption y «al calendario».
// ============================================================================
//
// La versión React del Studio del sistema de hoy (public/previews/breakpoint/club/studio.mjs, `abrirStudio`): a
// pantalla completa, un <dialog> NATIVO abierto con `showModal()` (el foco queda adentro, Escape cierra, lo de atrás
// queda inerte). A la izquierda la plantilla, el formato, los campos de esa plantilla, la foto de fondo (no sale del
// equipo) y el día y la hora; a la derecha la vista previa (el lienzo, studio-placa.ts), «Guardar en el calendario»,
// «Descargar imagen (PNG)», «Copiar caption» y el caption sugerido, que se puede editar.
//
// Lo abre NovedadesDelClub.tsx con un `import()` dinámico (no engorda la recepción). Guardar pasa por la pantalla
// (`onGuardar` → `ejecutarNovedades` → el motor): si dice que no, el Studio queda abierto con el motivo. Lo puro
// (plantillas, caption, medidas, lo que se guarda) está en studio-core.ts. Nada se anima.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Icono } from "@/components/ui/Icono";
import { cn } from "@/components/ui/cn";
import type { Fecha } from "@/lib/club/motor.mjs";
import {
  AVISO_RECORTE,
  CAMPOS,
  OPCIONES_FORMATO,
  OPCIONES_PLANTILLA,
  PLANTILLAS,
  armarCaption,
  datosParaGuardar,
  descripcionDeLaPlaca,
  estadoInicial,
  etiquetaDelCampo,
  motivoParaNoUsarLaFoto,
  nombreArchivo,
  pistaDelCampo,
  valoresDeLaPlantilla,
  type ClaveCampo,
  type ClaveFormato,
  type ClavePlantilla,
  type EstadoDelStudio,
  type PiezaDelStudio,
  type PublicacionDelStudio,
} from "./studio-core";
import { FUENTES_DE_LA_PLACA, MUESTRAS_DE_FUENTES, dibujarPieza, type FotoDeFondo } from "./studio-placa";

export interface PropsDelStudio {
  /** Lo que trae la difusión (tipo, título, texto) o null (desde el calendario: arranca con el ejemplo). */
  pieza: PiezaDelStudio | null;
  /** El día del club (el reloj del almacén): la fecha de publicación arranca ahí. */
  hoy: Fecha;
  /** Agenda la publicación en el calendario. `ok: false` deja el Studio abierto con el motivo. */
  onGuardar: (d: PublicacionDelStudio) => { ok: boolean; mensaje: string };
  /** Se cerró (×, Escape o después de guardar). */
  onCerrar: (r: { guardado: boolean }) => void;
}

type Mensaje = { tipo: "error" | "ok"; texto: string } | null;

const etiqueta = "text-sm font-medium text-strong";

/** Las tipografías de la placa, una sola vez por página (si no cargan, la placa sale con las de respaldo). */
function useFuentesDeLaPlaca(): number {
  const [listas, setListas] = useState(0);
  useEffect(() => {
    if (!document.getElementById("studio-fuentes")) {
      const l = Object.assign(document.createElement("link"), { id: "studio-fuentes", rel: "stylesheet", href: FUENTES_DE_LA_PLACA });
      document.head.append(l);
    }
    let vivo = true;
    const cargas = document.fonts?.load ? MUESTRAS_DE_FUENTES.map((f) => document.fonts.load(f).catch(() => null)) : [];
    const corte = new Promise((r) => setTimeout(r, 3000));
    Promise.race([Promise.all(cargas), corte]).then(() => vivo && setListas((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  return listas;
}

/** La foto de fondo: se lee en el equipo (URL local) y se suelta al cambiarla o al cerrar. */
function useFotoDeFondo(alMensaje: (m: Mensaje) => void) {
  const [foto, setFoto] = useState<FotoDeFondo | null>(null);
  const url = useRef<string | null>(null);
  const soltar = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  };
  useEffect(() => soltar, []);
  const elegir = (f: File) => {
    const motivo = motivoParaNoUsarLaFoto(f);
    if (motivo) return alMensaje({ tipo: "error", texto: motivo });
    const im = new Image();
    const nueva = URL.createObjectURL(f);
    im.onload = () => {
      soltar();
      url.current = nueva;
      setFoto(im);
      alMensaje({ tipo: "ok", texto: "Foto puesta de fondo." });
    };
    im.onerror = () => {
      URL.revokeObjectURL(nueva);
      alMensaje({ tipo: "error", texto: "No se pudo leer la foto. Probá con otra." });
    };
    im.src = nueva;
  };
  const quitar = () => {
    soltar();
    setFoto(null);
    alMensaje({ tipo: "ok", texto: "Foto quitada." });
  };
  return { foto, elegir, quitar };
}

function CampoDeLaPlantilla({ id, campo, st, onCambiar }: { id: string; campo: ClaveCampo; st: EstadoDelStudio; onCambiar: (campo: ClaveCampo, valor: string) => void }) {
  const props = {
    id: `${id}-${campo}`,
    value: st.valores[campo],
    placeholder: pistaDelCampo(st.plantilla, campo),
    onChange: (ev: { target: { value: string } }) => onCambiar(campo, ev.target.value),
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={props.id} className={etiqueta}>
        {etiquetaDelCampo(st.plantilla, campo)}
      </label>
      {CAMPOS[campo].multi ? <Textarea rows={campo === "horarios" ? 5 : 3} {...props} /> : <Input type="text" autoComplete="off" {...props} />}
    </div>
  );
}

export default function StudioDeRedes({ pieza, hoy, onGuardar, onCerrar }: PropsDelStudio) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [st, setSt] = useState<EstadoDelStudio>(() => estadoInicial(pieza, hoy));
  const [captionManual, setCaptionManual] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [recortado, setRecortado] = useState(false);
  const guardado = useRef(false);
  const fuentes = useFuentesDeLaPlaca();
  const { foto, elegir, quitar } = useFotoDeFondo(setMensaje);
  const sugerido = useMemo(() => armarCaption(st.plantilla, st.valores), [st.plantilla, st.valores]);
  const caption = captionManual ?? sugerido;

  // Abre como modal; al cerrar, el foco vuelve a quien lo abrió (si sigue en la página).
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const volverA = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    document.getElementById(`${id}-plantilla`)?.focus();
    return () => {
      if (volverA && document.contains(volverA)) volverA.focus();
    };
  }, [id]);

  // La placa se redibuja con cada cambio (una vez por cuadro) y cuando llegan las tipografías.
  useEffect(() => {
    const cv = lienzo.current;
    const ctx = cv?.getContext("2d");
    if (!ctx) return;
    const cuadro = requestAnimationFrame(() => {
      try {
        setRecortado(dibujarPieza(ctx, { ...st, foto }).recortado);
      } catch {
        setMensaje({ tipo: "error", texto: "No se pudo dibujar la vista previa." });
      }
    });
    return () => cancelAnimationFrame(cuadro);
  }, [st, foto, fuentes]);

  const cambiarCampo = (campo: ClaveCampo, valor: string) =>
    setSt((x) => ({ ...x, valores: { ...x.valores, [campo]: valor }, tocados: x.tocados.includes(campo) ? x.tocados : [...x.tocados, campo] }));
  const cambiarPlantilla = (plantilla: ClavePlantilla) => setSt((x) => ({ ...x, plantilla, valores: valoresDeLaPlantilla(plantilla, x.valores, x.tocados) }));

  const cerrar = () => dialogo.current?.close();

  const copiar = async () => {
    const ok = () => setMensaje({ tipo: "ok", texto: "Caption copiado: pegalo en Instagram." });
    try {
      await navigator.clipboard.writeText(caption);
      ok();
    } catch {
      const el = document.getElementById(`${id}-caption`) as HTMLTextAreaElement | null;
      el?.focus();
      el?.select();
      let hecho = false;
      try {
        hecho = document.execCommand("copy");
      } catch {
        hecho = false;
      }
      if (hecho) ok();
      else setMensaje({ tipo: "error", texto: "No se pudo copiar solo. El texto quedó seleccionado: copialo con Ctrl+C (o dejando apretado en el celu)." });
    }
  };

  const descargar = () => {
    const cv = lienzo.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    dibujarPieza(ctx, { ...st, foto });
    const nombre = nombreArchivo(st.plantilla, st.fecha);
    const bajar = (href: string, liberar: boolean) => {
      const a = Object.assign(document.createElement("a"), { href, download: nombre });
      dialogo.current?.append(a); // dentro del diálogo: fuera de él la página está inerte
      a.click();
      a.remove();
      if (liberar) setTimeout(() => URL.revokeObjectURL(href), 4000);
      setMensaje({ tipo: "ok", texto: `Imagen descargada: ${nombre}` });
    };
    const porDataUrl = () => {
      try {
        bajar(cv.toDataURL("image/png"), false);
      } catch {
        setMensaje({ tipo: "error", texto: "No se pudo armar la imagen. Sacale una captura a la vista previa." });
      }
    };
    try {
      cv.toBlob((b) => (b ? bajar(URL.createObjectURL(b), true) : porDataUrl()), "image/png");
    } catch {
      porDataUrl();
    }
  };

  const guardar = () => {
    const r = datosParaGuardar({ ...st, caption });
    if (!r.ok) return setMensaje({ tipo: "error", texto: r.motivo });
    const d = onGuardar(r.datos);
    if (!d.ok) return setMensaje({ tipo: "error", texto: d.mensaje || "No se pudo guardar en el calendario." });
    guardado.current = true;
    cerrar();
  };

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      onClose={() => onCerrar({ guardado: guardado.current })}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-surface p-0 text-body backdrop:bg-black/40"
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-t`} className="text-lg font-semibold text-strong">
            Studio de redes
          </h2>
          <p id={`${id}-d`} className="text-sm text-body">
            Armá la placa con la marca del club, copiá el texto y mandala al calendario.
          </p>
        </div>
        <IconButton etiqueta="Cerrar el Studio" icono={<Icono nombre="cerrar" />} onClick={cerrar} />
      </header>

      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-5 p-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:gap-7 lg:p-6">
        <form className="flex min-w-0 flex-col gap-3" noValidate onSubmit={(ev) => ev.preventDefault()} aria-label="Lo que dice la placa">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-plantilla`} className={etiqueta}>
                Plantilla
              </label>
              <Select id={`${id}-plantilla`} value={st.plantilla} onChange={(ev) => cambiarPlantilla(ev.target.value as ClavePlantilla)}>
                {OPCIONES_PLANTILLA.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-formato`} className={etiqueta}>
                Formato
              </label>
              <Select id={`${id}-formato`} value={st.formato} onChange={(ev) => setSt((x) => ({ ...x, formato: ev.target.value as ClaveFormato }))}>
                {OPCIONES_FORMATO.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {PLANTILLAS[st.plantilla].campos.map((c) => (
            <CampoDeLaPlantilla key={`${st.plantilla}-${c}`} id={id} campo={c} st={st} onCambiar={cambiarCampo} />
          ))}

          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-foto`} className={etiqueta}>
              Foto de fondo (opcional)
            </label>
            <input
              id={`${id}-foto`}
              type="file"
              accept="image/*"
              aria-describedby={`${id}-foto-ayuda`}
              className="min-h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface-raised p-2 text-sm text-strong file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) elegir(f);
              }}
            />
            <p id={`${id}-foto-ayuda`} className="text-xs text-body">
              La foto queda en tu equipo: no se sube a ningún lado.
            </p>
            {foto && (
              <Button
                type="button"
                variant="outline"
                size="md"
                className="self-start max-sm:w-full"
                onClick={() => {
                  quitar();
                  const input = document.getElementById(`${id}-foto`) as HTMLInputElement | null;
                  if (input) {
                    input.value = "";
                    input.focus();
                  }
                }}
              >
                Quitar la foto
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-fecha`} className={etiqueta}>
                Día de publicación
              </label>
              <Input id={`${id}-fecha`} type="date" value={st.fecha} onChange={(ev) => setSt((x) => ({ ...x, fecha: ev.target.value }))} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-hora`} className={etiqueta}>
                Hora
              </label>
              <Input id={`${id}-hora`} type="time" step={300} value={st.hora} onChange={(ev) => setSt((x) => ({ ...x, hora: ev.target.value }))} />
            </div>
          </div>
        </form>

        <section aria-label="Vista previa y acciones" className="flex min-w-0 flex-col gap-3">
          <div className="grid place-items-center rounded-lg border border-line bg-surface-sunken p-3">
            <canvas ref={lienzo} width={1080} height={1080} role="img" aria-label={descripcionDeLaPlaca(st)} className="block h-auto max-h-[70vh] w-auto max-w-full rounded-md shadow-raised" />
          </div>
          {recortado && <p className="text-sm text-body">{AVISO_RECORTE}</p>}
          <p role="alert" className={cn("text-sm font-medium", mensaje?.tipo === "error" ? "rounded-md bg-danger-soft px-3 py-2 text-strong" : "sr-only")}>
            {mensaje?.tipo === "error" ? mensaje.texto : ""}
          </p>
          <p role="status" className={cn("text-sm font-medium", mensaje?.tipo === "ok" ? "rounded-md bg-success-soft px-3 py-2 text-strong" : "sr-only")}>
            {mensaje?.tipo === "ok" ? mensaje.texto : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="solid" size="md" onClick={guardar} className="max-sm:w-full">
              Guardar en el calendario
            </Button>
            <Button type="button" variant="outline" size="md" onClick={descargar} className="max-sm:w-full">
              Descargar imagen (PNG)
            </Button>
            <Button type="button" variant="outline" size="md" onClick={copiar} className="max-sm:w-full">
              Copiar caption
            </Button>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-caption`} className={etiqueta}>
              Caption sugerido (lo podés editar)
            </label>
            <Textarea id={`${id}-caption`} rows={9} value={caption} onChange={(ev) => setCaptionManual(ev.target.value)} className="min-h-48" />
            {captionManual !== null && (
              <Button
                type="button"
                variant="outline"
                size="md"
                className="self-start max-sm:w-full"
                onClick={() => {
                  setCaptionManual(null);
                  document.getElementById(`${id}-caption`)?.focus();
                }}
              >
                Volver al sugerido
              </Button>
            )}
          </div>
        </section>
      </div>
    </dialog>
  );
}
