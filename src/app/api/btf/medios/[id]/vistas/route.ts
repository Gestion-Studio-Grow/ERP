// POST /api/btf/medios/:id/vistas → { previa, miniatura }: PUT prefirmados para rehacer la marca de agua.
import { exigirServidor } from "@/lib/btf/db";
import { medioDelDueno } from "@/lib/btf/dueno";
import { json, manejar } from "@/lib/btf/http";
import { configS3, urlFirmadaPut } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const m = await medioDelDueno(id, exigirFotografo(request));
    const cfg = configS3()!;
    return json({
      previa: urlFirmadaPut(cfg.bucketPrevias, m.clavePrevia, m.mimePrevia, 600),
      miniatura: urlFirmadaPut(cfg.bucketPrevias, m.claveMiniatura, m.mimePrevia, 600),
    });
  });
}
