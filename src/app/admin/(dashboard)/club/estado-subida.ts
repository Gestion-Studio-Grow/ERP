// ============================================================================
// LA SUBIDA DE UNA FOTO DEL CLUB — el gzip que llega a las acciones del servidor, con topes (BP-3). PURO.
// ============================================================================
//
// Vive aparte de estado-actions.ts porque ése es `"use server"`: todo lo que exporta es un endpoint y tiene que
// ser una función async con guardia. Acá no hay guardia ni base: sólo el FormData y los topes, y se prueba solo
// (estado-subida.test.ts).
//
// Dos topes:
//   · COMPRIMIDO (900 KB): deja aire bajo el 1 MB del cuerpo de una server action.
//   · TEXTO (10 MB, Gate M3): un mes de club lleno son ~3 MB y dos meses ~6 MB; más que eso no es un club real sino
//     un gzip armado para inflarse (una bomba de descompresión). Antes eran 48 MB: le dejaba a cualquiera con
//     `agenda:manage` hacerle reservar al servidor ~50 MB por pedido y después parsearlos.
//
// — Elaborado por GSG

import { gunzipSync } from "node:zlib";

/** Lo más que se acepta comprimido (deja aire bajo el 1 MB del cuerpo de la acción). */
export const TOPE_COMPRIMIDO = 900 * 1024;
/** Lo más que se acepta descomprimido (dos meses de club lleno son ~6 MB). */
export const TOPE_TEXTO = 10 * 1024 * 1024;

export const MENSAJE_NO_LLEGO = "No llegó la foto del club.";
export const MENSAJE_COMPRIMIDO_GRANDE = "La foto del club es demasiado grande para guardarla de una vez.";
export const MENSAJE_TEXTO_GRANDE =
  "La foto del club pasa de 10 MB: es mucho más de lo que junta un club en dos meses. No se guardó. Archivá los días cerrados y volvé a intentar.";
export const MENSAJE_DANIADA = "La foto del club llegó dañada: no se pudo leer.";

/** El texto de un gzip, con el tope de lo descomprimido (`tope`, en bytes). */
export function textoDelGzip(gzip: Buffer, tope = TOPE_TEXTO): { texto: string } | { error: string } {
  try {
    return { texto: gunzipSync(gzip, { maxOutputLength: tope }).toString("utf8") };
  } catch (e) {
    // Node corta la descompresión al pasar el tope con ERR_BUFFER_TOO_LARGE (RangeError): no es un archivo roto,
    // es uno demasiado grande, y se dice así.
    if ((e as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE") return { error: MENSAJE_TEXTO_GRANDE };
    return { error: MENSAJE_DANIADA };
  }
}

/** El texto de un gzip subido en `campo` de un FormData, o por qué no. */
export async function textoSubido(datos: FormData, campo: string): Promise<{ texto: string } | { error: string }> {
  const archivo = datos.get(campo);
  if (!(archivo instanceof Blob)) return { error: MENSAJE_NO_LLEGO };
  if (archivo.size > TOPE_COMPRIMIDO) return { error: MENSAJE_COMPRIMIDO_GRANDE };
  return textoDelGzip(Buffer.from(await archivo.arrayBuffer()));
}
