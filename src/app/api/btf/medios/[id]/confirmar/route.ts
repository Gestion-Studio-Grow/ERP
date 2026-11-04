// POST /api/btf/medios/:id/confirmar → Medio con subido:true (recién ahí es público).
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { medioDelDueno } from "@/lib/btf/dueno";
import { json, manejar } from "@/lib/btf/http";
import { medioRed } from "@/lib/btf/mapeo";
import { configS3 } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    await medioDelDueno(id, exigirFotografo(request));
    const m = await btfDb.btfMedio.update({ where: { id }, data: { subido: true } });
    return json(medioRed(m, configS3()!.urlPublicaPrevias));
  });
}
