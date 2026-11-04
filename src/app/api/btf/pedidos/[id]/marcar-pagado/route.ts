// POST /api/btf/pedidos/:id/marcar-pagado → el dueño confirma una transferencia recibida. Sólo transferencia
// (un pedido de MP se marca solo, contra MP). Ya pagado → lo devuelve igual (idempotente, no re-consume cupón).
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, manejar } from "@/lib/btf/http";
import { pedidoRed } from "@/lib/btf/mapeo";
import { marcarPagado } from "@/lib/btf/pagos";
import { exigirFotografo } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const fotografoId = exigirFotografo(request);
    const p = await btfDb.btfPedido.findUnique({ where: { id } });
    if (!p) throw new ErrorBtf("no-encontrado", "No encontramos ese pedido.");
    if (p.fotografoId !== fotografoId) throw new ErrorBtf("prohibido", "Ese pedido no es tuyo.");
    if (p.estado === "pagado") return json(pedidoRed(p, false));
    if (p.metodo !== "transferencia") throw new ErrorBtf("prohibido", "Sólo se marcan a mano los pedidos por transferencia.");
    const { pedido } = await marcarPagado(id, `TRANSF-${new Date().toISOString().slice(0, 10)}`);
    return json(pedidoRed(pedido, false));
  });
}
