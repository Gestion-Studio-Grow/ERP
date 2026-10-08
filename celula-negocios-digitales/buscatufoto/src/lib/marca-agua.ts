"use client";

import type { MarcaAgua, TipoMedio } from "./tipos";

/**
 * Motor de marca de agua. Corre 100 % en el navegador con <canvas>.
 *
 * Lo que sale de acá es lo ÚNICO que ve el comprador antes de pagar:
 *  - vista previa: lado mayor ≤ 1280 px, JPEG 0,78, con marca;
 *  - miniatura: lado mayor ≤ 480 px, JPEG 0,72, con marca.
 * El original no pasa por acá: lo guarda el repositorio en otro almacén.
 */

export const LADO_PREVIA = 1280;
export const LADO_MINIATURA = 480;
/** por debajo de esto la marca no protege */
export const OPACIDAD_MIN = 0.15;

export const MARCA_POR_DEFECTO: MarcaAgua = {
  texto: "buscatufoto · vista previa",
  logo: null,
  color: "#ffffff",
  opacidad: 0.34,
  escala: 1,
  angulo: -28,
  modo: "mosaico",
};

type Dibujable = CanvasImageSource & { width?: number; height?: number };

const cacheLogos = new Map<string, Promise<HTMLImageElement | null>>();

export function cargarLogo(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = cacheLogos.get(src);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
    cacheLogos.set(src, p);
  }
  return p;
}

/**
 * Dibuja la marca sobre un contexto ya pintado con la foto. Sirve igual para la vista en vivo del editor
 * y para el procesamiento final, así lo que se ve es lo que sale.
 */
export function dibujarMarca(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  marca: MarcaAgua,
  logo: HTMLImageElement | null,
): void {
  const base = Math.min(w, h);
  const esc = Math.max(0.3, Math.min(3, marca.escala));
  const fuente = Math.max(12, Math.round(base * 0.055 * esc));
  // Nunca una vista previa sin marca: sin texto ni logo, va el texto por defecto.
  const texto = marca.texto.trim() || (logo ? "" : MARCA_POR_DEFECTO.texto);
  const logoAlto = logo ? Math.round(fuente * 1.6) : 0;
  const logoAncho = logo ? Math.round((logo.naturalWidth / Math.max(1, logo.naturalHeight)) * logoAlto) : 0;

  ctx.save();
  ctx.globalAlpha = Math.max(OPACIDAD_MIN, Math.min(0.9, marca.opacidad));
  ctx.fillStyle = marca.color;
  ctx.strokeStyle = esOscuro(marca.color) ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, fuente * 0.04);
  ctx.font = `500 ${fuente}px "Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const anchoTexto = texto ? ctx.measureText(texto).width : 0;
  const sep = logo && texto ? fuente * 0.5 : 0;
  const anchoSello = logoAncho + sep + anchoTexto;
  const altoSello = Math.max(logoAlto, fuente);

  const sello = (cx: number, cy: number) => {
    let x = cx - anchoSello / 2;
    if (logo) {
      ctx.drawImage(logo, x, cy - logoAlto / 2, logoAncho, logoAlto);
      x += logoAncho + sep;
    }
    if (texto) {
      ctx.strokeText(texto, x, cy);
      ctx.fillText(texto, x, cy);
    }
  };

  ctx.translate(w / 2, h / 2);
  ctx.rotate((Math.max(-60, Math.min(60, marca.angulo)) * Math.PI) / 180);

  if (marca.modo === "centro") {
    const k = Math.min(1.8, (w * 0.8) / Math.max(1, anchoSello));
    ctx.scale(k, k);
    sello(0, 0);
  } else {
    const pasoX = anchoSello + fuente * 3;
    const pasoY = altoSello + fuente * 2.6;
    const diag = Math.hypot(w, h);
    let fila = 0;
    for (let y = -diag / 2; y <= diag / 2; y += pasoY, fila++) {
      const corr = fila % 2 ? pasoX / 2 : 0;
      for (let x = -diag / 2 - pasoX + corr; x <= diag / 2 + pasoX; x += pasoX) sello(x + anchoSello / 2, y);
    }
  }
  ctx.restore();
}

function esOscuro(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function lienzo(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function aBlob(c: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo generar la imagen."))), "image/jpeg", calidad),
  );
}

async function renderMarcado(
  fuente: Dibujable,
  ancho: number,
  alto: number,
  lado: number,
  marca: MarcaAgua,
  logo: HTMLImageElement | null,
  calidad: number,
  rotuloVideo: boolean,
): Promise<Blob> {
  const k = Math.min(1, lado / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * k));
  const h = Math.max(1, Math.round(alto * k));
  const c = lienzo(w, h);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite dibujar imágenes (canvas).");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuente, 0, 0, w, h);
  dibujarMarca(ctx, w, h, marca, logo);
  if (rotuloVideo) dibujarRotuloVideo(ctx, w, h);
  return aBlob(c, calidad);
}

function dibujarRotuloVideo(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = Math.min(w, h) * 0.09;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(w / 2 - r * 0.32, h / 2 - r * 0.45);
  ctx.lineTo(w / 2 + r * 0.5, h / 2);
  ctx.lineTo(w / 2 - r * 0.32, h / 2 + r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface Procesado {
  tipo: TipoMedio;
  ancho: number;
  alto: number;
  duracion: number | null;
  previa: Blob;
  miniatura: Blob;
}

export const TIPOS_ACEPTADOS = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
export const PESO_MAX_FOTO = 40 * 1024 * 1024;
export const PESO_MAX_VIDEO = 300 * 1024 * 1024;

export function tipoDeArchivo(f: File | Blob): TipoMedio | null {
  if (f.type.startsWith("image/")) return "foto";
  if (f.type.startsWith("video/")) return "video";
  return null;
}

/** Procesa un archivo original y devuelve vista previa y miniatura marcadas. */
export async function procesarArchivo(archivo: Blob, marca: MarcaAgua): Promise<Procesado> {
  const tipo = tipoDeArchivo(archivo);
  if (!tipo) throw new Error("Formato no soportado. Subí JPG, PNG, WebP, MP4 o WebM.");
  const logo = await cargarLogo(marca.logo);

  if (tipo === "foto") {
    const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    try {
      const previa = await renderMarcado(bmp, bmp.width, bmp.height, LADO_PREVIA, marca, logo, 0.78, false);
      const miniatura = await renderMarcado(bmp, bmp.width, bmp.height, LADO_MINIATURA, marca, logo, 0.72, false);
      return { tipo, ancho: bmp.width, alto: bmp.height, duracion: null, previa, miniatura };
    } finally {
      bmp.close();
    }
  }

  // Video: se toma un fotograma (al 20 % o al segundo 1) y se marca. El video original nunca se reproduce
  // para el comprador antes de pagar: la vista previa de un video es ese fotograma marcado.
  const { video, liberar } = await cargarVideo(archivo);
  try {
    const t = Math.min(Math.max(0.1, video.duration * 0.2), 1);
    await buscar(video, Number.isFinite(t) ? t : 0.1);
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) throw new Error("No se pudo leer el video. Probá con MP4 (H.264).");
    const previa = await renderMarcado(video, w, h, LADO_PREVIA, marca, logo, 0.78, true);
    const miniatura = await renderMarcado(video, w, h, LADO_MINIATURA, marca, logo, 0.72, true);
    const duracion = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
    return { tipo, ancho: w, alto: h, duracion, previa, miniatura };
  } finally {
    liberar();
  }
}

function cargarVideo(b: Blob): Promise<{ video: HTMLVideoElement; liberar: () => void }> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(b);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const liberar = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    video.onloadeddata = () => res({ video, liberar });
    video.onerror = () => {
      liberar();
      rej(new Error("Tu navegador no puede leer este video. Probá con MP4 (H.264)."));
    };
    video.src = url;
  });
}

function buscar(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const fin = () => {
      v.removeEventListener("seeked", fin);
      res();
    };
    v.addEventListener("seeked", fin);
    v.currentTime = t;
    setTimeout(fin, 2500);
  });
}

/** Dibuja una imagen de fondo (para la vista en vivo del editor) y la marca encima. */
export async function pintarVistaEnVivo(
  canvas: HTMLCanvasElement,
  fuente: CanvasImageSource | null,
  fuenteAncho: number,
  fuenteAlto: number,
  marca: MarcaAgua,
): Promise<void> {
  const logo = await cargarLogo(marca.logo);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (fuente && fuenteAncho && fuenteAlto) {
    const k = Math.max(w / fuenteAncho, h / fuenteAlto);
    const dw = fuenteAncho * k, dh = fuenteAlto * k;
    ctx.drawImage(fuente, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#555";
    ctx.fillRect(0, 0, w, h);
  }
  dibujarMarca(ctx, w, h, marca, logo);
}
