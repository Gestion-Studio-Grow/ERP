// GET /api/btf/fotografos/:usuario → { fotografo (público), albumes publicados (públicos) }.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, manejar } from "@/lib/btf/http";
import { albumPublico, fotografoPublico } from "@/lib/btf/mapeo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ usuario: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { usuario } = await params;
    const f = await btfDb.btfFotografo.findUnique({ where: { usuario: usuario.toLowerCase() } });
    if (!f) throw new ErrorBtf("no-encontrado", "Ese fotógrafo no existe.");
    const albumes = await btfDb.btfAlbum.findMany({ where: { fotografoId: f.id, publicado: true }, orderBy: { fecha: "desc" } });
    return json({ fotografo: fotografoPublico(f), albumes: albumes.map(albumPublico) });
  });
}
