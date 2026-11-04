// Cargas con control de dueño: todo lo del panel pasa por acá. El dueño es `fotografoId` de la sesión.

import { btfDb } from "./db";
import { ErrorBtf } from "./http";
import { aSlug } from "./ids";

export async function albumDelDueno(id: string, fotografoId: string) {
  const a = await btfDb.btfAlbum.findUnique({ where: { id } });
  if (!a) throw new ErrorBtf("no-encontrado", "Ese álbum no existe.");
  if (a.fotografoId !== fotografoId) throw new ErrorBtf("prohibido", "Ese álbum no es tuyo.");
  return a;
}

export async function medioDelDueno(id: string, fotografoId: string) {
  const m = await btfDb.btfMedio.findUnique({ where: { id } });
  if (!m) throw new ErrorBtf("no-encontrado", "Esa foto no existe.");
  if (m.fotografoId !== fotografoId) throw new ErrorBtf("prohibido", "Esa foto no es tuya.");
  return m;
}

/** Slug libre a partir de un texto; si choca, sufijo -2, -3… (excluye `exceptoId`). */
export async function slugLibre(texto: string, exceptoId?: string): Promise<string> {
  const base = aSlug(texto) || "album";
  for (let n = 1; n < 200; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const otro = await btfDb.btfAlbum.findUnique({ where: { slug }, select: { id: true } });
    if (!otro || otro.id === exceptoId) return slug;
  }
  throw new ErrorBtf("duplicado", "Ese enlace ya está tomado.");
}

export async function usuarioLibre(texto: string, exceptoId?: string): Promise<string> {
  const base = aSlug(texto) || "fotografo";
  for (let n = 1; n < 200; n++) {
    const usuario = n === 1 ? base : `${base}-${n}`;
    const otro = await btfDb.btfFotografo.findUnique({ where: { usuario }, select: { id: true } });
    if (!otro || otro.id === exceptoId) return usuario;
  }
  throw new ErrorBtf("duplicado", "Ese usuario ya está tomado.");
}
