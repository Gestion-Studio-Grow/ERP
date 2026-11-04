// PATCH /api/btf/medios/:id { dorsales?, oculto? } → Medio · DELETE → borra fila y objetos (best effort).
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { medioDelDueno } from "@/lib/btf/dueno";
import { json, leerCuerpo, manejar } from "@/lib/btf/http";
import { medioRed } from "@/lib/btf/mapeo";
import { borrarObjeto, configS3 } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";
import { dorsales } from "@/lib/btf/validar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    await medioDelDueno(id, exigirFotografo(request));
    const c = await leerCuerpo(request);
    const data: { dorsales?: string[]; oculto?: boolean } = {};
    if ("dorsales" in c) data.dorsales = dorsales(c.dorsales);
    if ("oculto" in c) data.oculto = c.oculto === true;
    const m = await btfDb.btfMedio.update({ where: { id }, data });
    return json(medioRed(m, configS3()!.urlPublicaPrevias));
  });
}

export function DELETE(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const m = await medioDelDueno(id, exigirFotografo(request));
    await btfDb.$transaction([
      btfDb.btfAlbum.updateMany({ where: { id: m.albumId, portadaId: id }, data: { portadaId: null } }),
      btfDb.btfMedio.delete({ where: { id } }),
    ]);
    const cfg = configS3()!;
    await Promise.all([
      borrarObjeto(cfg.bucketOriginales, m.claveOriginal),
      borrarObjeto(cfg.bucketPrevias, m.clavePrevia),
      borrarObjeto(cfg.bucketPrevias, m.claveMiniatura),
    ]);
    return json({ ok: true });
  });
}
