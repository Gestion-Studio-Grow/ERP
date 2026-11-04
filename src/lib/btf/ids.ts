// Identificadores, slugs y claves del almacén de buscatufoto. PURO salvo el azar.

import { randomBytes } from "node:crypto";

export function nuevoId(prefijo: string): string {
  return prefijo + randomBytes(10).toString("hex");
}

/** Clave de un pedido: 48 hex (192 bits). */
export function nuevaClave(): string {
  return randomBytes(24).toString("hex");
}

/** "10K de la Costanera 2026" → "10k-de-la-costanera-2026" (misma regla que la app). */
export function aSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const EXTENSIONES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Extensión para un MIME admitido; null si no se admite. */
export function extensionDe(mime: string): string | null {
  return EXTENSIONES[mime.toLowerCase()] ?? null;
}

export function claveOriginal(fotografoId: string, albumId: string, medioId: string, ext: string): string {
  return `o/${fotografoId}/${albumId}/${medioId}.${ext}`;
}

export function clavePrevia(albumId: string, medioId: string, ext: string): string {
  return `p/${albumId}/${medioId}.${ext}`;
}

export function claveMiniatura(albumId: string, medioId: string, ext: string): string {
  return `m/${albumId}/${medioId}.${ext}`;
}
