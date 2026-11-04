// GET /api/btf/albumes → mis álbumes · POST DatosAlbum & { consentimiento: true } → 201 Album.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { slugLibre } from "@/lib/btf/dueno";
import { ErrorBtf, json, leerCuerpo, manejar } from "@/lib/btf/http";
import { albumRed } from "@/lib/btf/mapeo";
import { exigirFotografo } from "@/lib/btf/sesion";
import { camposAlbum } from "@/lib/btf/validar";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const fotografoId = exigirFotografo(request);
    const albumes = await btfDb.btfAlbum.findMany({ where: { fotografoId }, orderBy: { creadoEn: "desc" } });
    return json(albumes.map(albumRed));
  });
}

export function POST(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const fotografoId = exigirFotografo(request);
    const c = await leerCuerpo(request);
    if (c.consentimiento !== true) {
      throw new ErrorBtf("invalido", "Para publicar fotos de personas tenés que confirmar que tenés su consentimiento o el del organizador.");
    }
    const d = camposAlbum(c);
    const slug = await slugLibre(typeof c.slug === "string" && c.slug.trim() ? c.slug : d.nombre);
    const a = await btfDb.btfAlbum.create({
      data: {
        ...d,
        paquetes: d.paquetes as unknown as Prisma.InputJsonValue,
        escalones: d.escalones as unknown as Prisma.InputJsonValue,
        cupones: d.cupones as unknown as Prisma.InputJsonValue,
        colaboradores: d.colaboradores as unknown as Prisma.InputJsonValue,
        slug,
        fotografoId,
        consentimientoEn: new Date(),
      },
    });
    return json(albumRed(a), 201);
  });
}
