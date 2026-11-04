// GET /api/btf/medios/:id/original → 302 a un GET prefirmado (10 min). Sólo el dueño.
import { exigirServidor } from "@/lib/btf/db";
import { medioDelDueno } from "@/lib/btf/dueno";
import { manejar } from "@/lib/btf/http";
import { configS3, urlFirmadaGet } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const m = await medioDelDueno(id, exigirFotografo(request));
    const url = urlFirmadaGet(configS3()!.bucketOriginales, m.claveOriginal, 600);
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  });
}
