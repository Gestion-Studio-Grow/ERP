"use client";

import { dorsalesDesdeNombre } from "./dorsales";
import { procesarArchivo } from "./marca-agua";
import { ARCHIVOS_MUESTRA } from "./muestras-lista";
import { obtenerRepo } from "./repo";
import type { Album, Fotografo } from "./tipos";

/**
 * Datos de muestra: una cuenta de fotógrafo de demostración y un álbum de un evento FICTICIO, con fotos
 * propias generadas por scripts/generar-muestras.py. Idempotente.
 */
export const SLUG_MUESTRA = "10k-costanera-muestra";
export const EMAIL_MUESTRA = "muestra@buscatufoto.demo";

let enCurso: Promise<{ fotografo: Fotografo; album: Album }> | null = null;

export function asegurarMuestras(alProgresar?: (hechas: number, total: number) => void) {
  if (!enCurso) enCurso = crear(alProgresar).finally(() => (enCurso = null));
  return enCurso;
}

async function crear(alProgresar?: (hechas: number, total: number) => void) {
  const repo = obtenerRepo();
  let fotografo = await repo.fotografoPorEmail(EMAIL_MUESTRA);
  if (!fotografo) {
    fotografo = await repo.registrarFotografo({ nombre: "Estudio de Muestra", email: EMAIL_MUESTRA });
    fotografo = await repo.actualizarFotografo(fotografo.id, {
      bio: "Cuenta de demostración de buscatufoto. El evento y las fotos son ficticios.",
      cobro: { metodo: "mercadopago", titular: "Estudio de Muestra", alias: "estudio.muestra.demo", cuit: "20-00000000-0" },
    });
  }
  let album = await repo.albumPorSlug(SLUG_MUESTRA);
  if (!album) {
    album = await repo.crearAlbum(fotografo.id, {
      slug: SLUG_MUESTRA,
      nombre: "10K de la Costanera (muestra)",
      evento: "carrera",
      lugar: "Costanera, CABA (evento ficticio)",
      fecha: "2026-10-04",
      descripcion:
        "Álbum de demostración con fotos ilustradas por nosotros. Buscá tu número (probá 1043, 73 o 4471), elegí las que te gusten y pagá en modo demostración.",
      precioFoto: 3500,
      precioVideo: 0,
      paquetes: [{ id: "pq_3", nombre: "3 fotos", cantidad: 3, precio: 8500 }],
      escalones: [{ desde: 5, porcentaje: 25 }],
      cupones: [
        { codigo: "LLEGADA", tipo: "porcentaje", valor: 20, tope: 3000, usosMax: 2, usos: 0, activo: true },
        { codigo: "AMIGOS500", tipo: "monto", valor: 500, tope: 0, usosMax: 0, usos: 0, activo: true },
      ],
      colaboradores: [],
      publicado: true,
    });
  }
  const existentes = new Set((await repo.mediosDe(album.id)).map((m) => m.nombreArchivo));
  const faltan = ARCHIVOS_MUESTRA.filter((n) => !existentes.has(n));
  let hechas = ARCHIVOS_MUESTRA.length - faltan.length;
  alProgresar?.(hechas, ARCHIVOS_MUESTRA.length);
  for (const nombre of faltan) {
    const r = await fetch(`/muestras/${nombre}`);
    if (!r.ok) throw new Error(`No se pudo cargar la muestra ${nombre}.`);
    const original = await r.blob();
    const p = await procesarArchivo(original, fotografo.marca);
    await repo.agregarMedio(album.id, { original, nombreArchivo: nombre, dorsales: dorsalesDesdeNombre(nombre), ...p });
    alProgresar?.(++hechas, ARCHIVOS_MUESTRA.length);
  }
  return { fotografo, album: (await repo.obtenerAlbum(album.id)) ?? album };
}
