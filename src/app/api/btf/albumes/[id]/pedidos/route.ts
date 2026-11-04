// GET /api/btf/albumes/:id/pedidos → pedidos del álbum (dueño), sin clave.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { albumDelDueno } from "@/lib/btf/dueno";
import { json, manejar } from "@/lib/btf/http";
import { pedidoRed } from "@/lib/btf/mapeo";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const fotografoId = exigirFotografo(request);
    await albumDelDueno(id, fotografoId);
    const l = await btfDb.btfPedido.findMany({ where: { albumId: id, fotografoId }, orderBy: { creadoEn: "desc" }, take: 1000 });
    return json(l.map((p) => pedidoRed(p, false)));
  });
}
