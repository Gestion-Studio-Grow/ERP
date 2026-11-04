// GET/PATCH/DELETE /api/btf/albumes/:id (sólo el dueño). DELETE borra álbum, medios y pedidos (cascada) y
// los objetos del almacén (best effort, después de borrar las filas).
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { albumDelDueno } from "@/lib/btf/dueno";
import { ErrorBtf, json, leerCuerpo, manejar } from "@/lib/btf/http";
import { aSlug } from "@/lib/btf/ids";
import { albumRed } from "@/lib/btf/mapeo";
import { borrarObjeto, configS3 } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";
import { camposAlbum } from "@/lib/btf/validar";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    return json(albumRed(await albumDelDueno(id, exigirFotografo(request))));
  });
}

export function PATCH(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const actual = albumRed(await albumDelDueno(id, exigirFotografo(request)));
    const c = await leerCuerpo(request);
    const d = camposAlbum(c, actual);
    const data: Prisma.BtfAlbumUpdateInput = {
      ...d,
      paquetes: d.paquetes as unknown as Prisma.InputJsonValue,
      escalones: d.escalones as unknown as Prisma.InputJsonValue,
      cupones: d.cupones as unknown as Prisma.InputJsonValue,
      colaboradores: d.colaboradores as unknown as Prisma.InputJsonValue,
    };
    if ("slug" in c) {
      const slug = aSlug(typeof c.slug === "string" ? c.slug : "");
      if (!slug) throw new ErrorBtf("invalido", "El enlace no puede quedar vacío.");
      const otro = await btfDb.btfAlbum.findUnique({ where: { slug }, select: { id: true } });
      if (otro && otro.id !== id) throw new ErrorBtf("duplicado", "Ese enlace ya está tomado.");
      data.slug = slug;
    }
    if ("portadaId" in c) {
      if (c.portadaId === null) data.portadaId = null;
      else {
        const m = typeof c.portadaId === "string" ? await btfDb.btfMedio.findUnique({ where: { id: c.portadaId }, select: { albumId: true } }) : null;
        if (!m || m.albumId !== id) throw new ErrorBtf("invalido", "La portada tiene que ser una foto de este álbum.");
        data.portadaId = c.portadaId as string;
      }
    }
    return json(albumRed(await btfDb.btfAlbum.update({ where: { id }, data })));
  });
}

export function DELETE(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    await albumDelDueno(id, exigirFotografo(request));
    const medios = await btfDb.btfMedio.findMany({ where: { albumId: id }, select: { claveOriginal: true, clavePrevia: true, claveMiniatura: true } });
    await btfDb.btfAlbum.delete({ where: { id } });
    const cfg = configS3()!;
    const objetos = medios.flatMap((m) => [
      [cfg.bucketOriginales, m.claveOriginal],
      [cfg.bucketPrevias, m.clavePrevia],
      [cfg.bucketPrevias, m.claveMiniatura],
    ]);
    for (let i = 0; i < objetos.length; i += 10) {
      await Promise.all(objetos.slice(i, i + 10).map(([b, k]) => borrarObjeto(b, k)));
    }
    return json({ ok: true });
  });
}
