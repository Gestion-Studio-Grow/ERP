// Carga pública de un álbum por slug: sólo publicados; medios subidos y no ocultos.
import { btfDb } from "@/lib/btf/db";
import { ErrorBtf } from "@/lib/btf/http";

export async function albumPublicoPorSlug(slug: string) {
  const album = await btfDb.btfAlbum.findUnique({ where: { slug: slug.toLowerCase() }, include: { fotografo: true } });
  if (!album || !album.publicado) throw new ErrorBtf("no-encontrado", "Ese álbum no existe o todavía no está publicado.");
  const medios = await btfDb.btfMedio.findMany({ where: { albumId: album.id, subido: true, oculto: false }, orderBy: { creadoEn: "asc" } });
  return { album, medios };
}
