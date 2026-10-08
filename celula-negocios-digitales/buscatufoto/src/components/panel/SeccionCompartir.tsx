"use client";

import { useEffect, useRef, useState } from "react";
import { Aviso, Boton, BotonLink, IconoCopiar, IconoDescargar, IconoEnlace, IconoWhatsapp, ModoDemo, claseEntrada } from "@/components/ui";
import { fechaLarga } from "@/lib/dinero";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Medio } from "@/lib/tipos";
import { Seccion, useOrigen } from "./comunes";
import s from "./panel.module.css";

const ANCHO = 1080;
const ALTO = 1920;

export function SeccionCompartir({ album, medios }: { album: Album; medios: Medio[] }) {
  const origen = useOrigen();
  const enlace = `${origen}/a/${album.slug}`;
  const campo = useRef<HTMLInputElement>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [errorPublicar, setErrorPublicar] = useState<string | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado("Enlace copiado.");
    } catch {
      campo.current?.focus();
      campo.current?.select();
      setCopiado("Seleccionamos el enlace: copialo con Ctrl+C (o mantené apretado en el celular).");
    }
  }

  async function publicar() {
    setErrorPublicar(null);
    try {
      await obtenerRepo().actualizarAlbum(album.id, { publicado: true });
    } catch (e) {
      setErrorPublicar(mensajeDeError(e));
    }
  }

  const texto = `Ya están las fotos de ${album.nombre}. Buscate por tu número: ${enlace}`;
  const portada = medios.find((m) => m.id === album.portadaId) ?? medios.find((m) => m.tipo === "foto") ?? null;

  return (
    <>
      <Seccion titulo="Enlace del álbum" bajada="Pasalo por el grupo de WhatsApp del evento, en tu Instagram o donde quieras.">
        {!album.publicado ? (
          <Aviso>
            <div className={s.avisoConBoton}>
              <span>El álbum está sin publicar: quien entre al enlace todavía no lo va a ver.</span>
              <Boton tam="chico" variante="primario" onClick={publicar}>
                Publicar ahora
              </Boton>
            </div>
          </Aviso>
        ) : null}
        {errorPublicar ? <Aviso tono="error">{errorPublicar}</Aviso> : null}
        <div className={s.filaEnlace}>
          <label htmlFor="enlace-album" className="sr-only">
            Enlace público del álbum
          </label>
          <input id="enlace-album" ref={campo} className={`${claseEntrada} mono`} value={enlace} readOnly onFocus={(e) => e.currentTarget.select()} />
          <Boton variante="primario" onClick={copiar}>
            <IconoCopiar /> Copiar
          </Boton>
          <BotonLink href={`/a/${album.slug}`} externo>
            <IconoEnlace /> Abrir
          </BotonLink>
        </div>
        {copiado ? (
          <p role="status" className={s.ayudaChica}>
            {copiado}
          </p>
        ) : null}
        <div className={s.filaBotones}>
          <BotonLink href={`https://wa.me/?text=${encodeURIComponent(texto)}`} externo variante="secundario">
            <IconoWhatsapp /> Compartir por WhatsApp (modo demostración)
          </BotonLink>
        </div>
        <p className={s.ayudaChica}>Código QR para imprimir: pendiente (no sumamos una librería todavía).</p>
      </Seccion>

      <Placa album={album} portada={portada} enlace={enlace} />
    </>
  );
}

/* ---------- Placa vertical para historias (1080 × 1920) ---------- */

function Placa({ album, portada, enlace }: { album: Album; portada: Medio | null; enlace: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previa = portada?.previa ?? null;

  useEffect(() => {
    let vivo = true;
    const c = lienzo.current;
    if (!c || !enlace) return;
    (async () => {
      try {
        await cargarFuentes();
        const img = previa ? await createImageBitmap(previa) : null;
        if (!vivo) {
          img?.close();
          return;
        }
        dibujarPlaca(c, album, img, enlace);
        img?.close();
        setListo(true);
        setError(null);
      } catch (e) {
        if (vivo) setError(mensajeDeError(e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [album, previa, enlace]);

  function descargar() {
    const c = lienzo.current;
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return setError("No se pudo generar la imagen.");
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = `placa-${album.slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  return (
    <Seccion titulo="Placa para historias" bajada="Imagen vertical de 1080 × 1920 con la portada del álbum, lista para subir a Instagram o a los estados de WhatsApp.">
      <div className={s.placa}>
        <canvas
          ref={lienzo}
          width={ANCHO}
          height={ALTO}
          className={s.placaLienzo}
          role="img"
          aria-label={`Placa para historias de ${album.nombre}, con el enlace ${enlace}`}
        />
        <div className={s.placaTexto}>
          <p>
            Usa la portada del álbum {portada ? "" : "(todavía no hay fotos: sale con un fondo liso)"}, ya con tu marca de agua. Si cambiás la portada o el
            nombre, la placa se actualiza sola.
          </p>
          <Boton variante="primario" onClick={descargar} disabled={!listo}>
            <IconoDescargar /> Descargar placa
          </Boton>
          <span className={s.rotuloLargo}>
            <ModoDemo>Se genera en tu navegador, no se sube a ningún lado</ModoDemo>
          </span>
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Seccion>
  );
}

async function cargarFuentes() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('300 120px "Hanken Grotesk Variable"'),
      document.fonts.load('500 40px "Hanken Grotesk Variable"'),
      document.fonts.load('500 40px "IBM Plex Mono"'),
    ]);
  } catch {
    /* si la fuente no carga, se dibuja con la del sistema */
  }
}

const SANS = '"Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const ACENTO = "#ff6a3d";

function partirLineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let linea = "";
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
    else {
      lineas.push(linea);
      linea = p;
    }
  }
  if (linea) lineas.push(linea);
  if (lineas.length > max) {
    const cortadas = lineas.slice(0, max);
    let ultima = cortadas[max - 1];
    while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > ancho) ultima = ultima.slice(0, -1);
    cortadas[max - 1] = `${ultima.trimEnd()}…`;
    return cortadas;
  }
  return lineas;
}

function dibujarPlaca(c: HTMLCanvasElement, album: Album, img: ImageBitmap | null, enlace: string) {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite dibujar imágenes (canvas).");
  const W = c.width;
  const H = c.height;
  const margen = 84;

  // Fondo: la portada marcada a sangre (cover), o un liso con tinte de acento.
  ctx.fillStyle = "#0b0d11";
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const k = Math.max(W / img.width, H / img.height);
    const dw = img.width * k;
    const dh = img.height * k;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    const g = ctx.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, H * 0.8);
    g.addColorStop(0, "rgba(255,106,61,0.35)");
    g.addColorStop(1, "rgba(11,13,17,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Degradé oscuro de abajo hacia arriba para que el texto se lea.
  const d = ctx.createLinearGradient(0, H * 0.3, 0, H);
  d.addColorStop(0, "rgba(11,13,17,0)");
  d.addColorStop(0.45, "rgba(11,13,17,0.78)");
  d.addColorStop(1, "rgba(11,13,17,0.97)");
  ctx.fillStyle = d;
  ctx.fillRect(0, 0, W, H);
  const arriba = ctx.createLinearGradient(0, 0, 0, 260);
  arriba.addColorStop(0, "rgba(11,13,17,0.65)");
  arriba.addColorStop(1, "rgba(11,13,17,0)");
  ctx.fillStyle = arriba;
  ctx.fillRect(0, 0, W, 260);

  // Logo tipográfico arriba.
  dibujarLogo(ctx, margen, 150, 64);

  // Bloque de texto, desde abajo hacia arriba.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  let y = H - 150;

  ctx.font = `500 40px ${MONO}`;
  ctx.fillStyle = ACENTO;
  const url = enlace.replace(/^https?:\/\//, "");
  let urlTexto = url;
  while (urlTexto.length > 8 && ctx.measureText(urlTexto).width > W - margen * 2) urlTexto = urlTexto.slice(0, -2);
  if (urlTexto !== url) urlTexto = `${urlTexto.slice(0, -1)}…`;
  ctx.fillText(urlTexto, margen, y);
  y -= 70;

  ctx.font = `400 42px ${SANS}`;
  ctx.fillStyle = "rgba(238,240,243,0.86)";
  ctx.fillText("Buscate por tu número en", margen, y);
  y -= 110;

  ctx.font = `300 116px ${SANS}`;
  ctx.fillStyle = "#eef0f3";
  const lineas = partirLineas(ctx, album.nombre, W - margen * 2, 3);
  for (let i = lineas.length - 1; i >= 0; i--) {
    ctx.fillText(lineas[i], margen, y);
    y -= 118;
  }
  y -= 4;

  ctx.font = `500 34px ${MONO}`;
  ctx.fillStyle = "rgba(238,240,243,0.75)";
  ctx.fillText(fechaLarga(album.fecha).toUpperCase(), margen, y);

  // Línea de llegada: una franja fina de acento.
  ctx.fillStyle = ACENTO;
  ctx.fillRect(margen, H - 96, 120, 6);
}

/** "busca[tu]foto" con "tu" en acento entre esquinas de visor. */
function dibujarLogo(ctx: CanvasRenderingContext2D, x: number, y: number, tam: number) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `300 ${tam}px ${SANS}`;
  ctx.fillStyle = "#eef0f3";
  ctx.fillText("busca", x, y);
  let cx = x + ctx.measureText("busca").width + tam * 0.12;
  ctx.font = `500 ${tam}px ${SANS}`;
  const anchoTu = ctx.measureText("tu").width;
  const pad = tam * 0.16;
  ctx.fillStyle = ACENTO;
  ctx.fillText("tu", cx + pad, y);
  // esquinas
  const izq = cx;
  const der = cx + anchoTu + pad * 2;
  const sup = y - tam * 0.82;
  const inf = y + tam * 0.16;
  const l = tam * 0.16;
  const g = Math.max(2, tam * 0.035);
  ctx.fillRect(izq, sup, l, g);
  ctx.fillRect(izq, sup, g, l);
  ctx.fillRect(der - l, sup, l, g);
  ctx.fillRect(der - g, sup, g, l);
  ctx.fillRect(izq, inf - g, l, g);
  ctx.fillRect(izq, inf - l, g, l);
  ctx.fillRect(der - l, inf - g, l, g);
  ctx.fillRect(der - g, inf - l, g, l);
  cx = der + tam * 0.12;
  ctx.font = `300 ${tam}px ${SANS}`;
  ctx.fillStyle = "#eef0f3";
  ctx.fillText("foto", cx, y);
  ctx.restore();
}
