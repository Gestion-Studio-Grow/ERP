// GET /api/btf/pedidos → mis pedidos (dueño), sin clave, más nuevos primero.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { json, manejar } from "@/lib/btf/http";
import { pedidoRed } from "@/lib/btf/mapeo";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const fotografoId = exigirFotografo(request);
    const l = await btfDb.btfPedido.findMany({ where: { fotografoId }, orderBy: { creadoEn: "desc" }, take: 1000 });
    return json(l.map((p) => pedidoRed(p, false)));
  });
}
