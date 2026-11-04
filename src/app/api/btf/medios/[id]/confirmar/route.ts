// POST /api/btf/medios/:id/confirmar → Medio con subido:true (recién ahí es público). Antes se verifica con un
// HEAD que el original esté de verdad en el almacén: si no, nadie podría descargar lo que pagó.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { medioDelDueno } from "@/lib/btf/dueno";
import { ErrorBtf, json, manejar } from "@/lib/btf/http";
import { medioRed } from "@/lib/btf/mapeo";
import { configS3, existeObjeto } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const medio = await medioDelDueno(id, exigirFotografo(request));
    let esta: boolean;
    try {
      esta = await existeObjeto(configS3()!.bucketOriginales, medio.claveOriginal);
    } catch {
      throw new ErrorBtf("no-configurado", "No pudimos comprobar el archivo en el almacén. Probá de nuevo en un rato.");
    }
    if (!esta) throw new ErrorBtf("invalido", "El original todavía no terminó de subir. Volvé a subirlo y confirmá de nuevo.");
    const m = await btfDb.btfMedio.update({ where: { id }, data: { subido: true } });
    return json(medioRed(m, configS3()!.urlPublicaPrevias));
  });
}
