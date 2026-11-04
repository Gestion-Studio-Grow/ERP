// GET /api/btf/a/:slug → { album (público), medios (subidos, no ocultos, sin nada del original), fotografo }.
import { exigirServidor } from "@/lib/btf/db";
import { json, manejar } from "@/lib/btf/http";
import { albumPublico, medioRed } from "@/lib/btf/mapeo";
import { configS3 } from "@/lib/btf/s3";
import { albumPublicoPorSlug } from "./publico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { slug } = await params;
    const { album, medios } = await albumPublicoPorSlug(slug);
    const url = configS3()!.urlPublicaPrevias;
    const f = album.fotografo;
    return json({
      album: albumPublico(album),
      medios: medios.map((m) => medioRed(m, url)),
      fotografo: { nombre: f.nombre, usuario: f.usuario, ...(f.whatsapp ? { whatsapp: f.whatsapp } : {}) },
    });
  });
}
