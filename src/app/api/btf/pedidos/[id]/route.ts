// GET /api/btf/pedidos/:id?clave= → Pedido (con clave). Clave en tiempo constante; clave mala = 404 (no se
// distingue de «no existe»). Si está pendiente y es MP, re-consulta MP antes de responder.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, manejar } from "@/lib/btf/http";
import { pedidoRed } from "@/lib/btf/mapeo";
import { claveCoincide, verificarEnMp } from "@/lib/btf/pagos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    const clave = new URL(request.url).searchParams.get("clave");
    let p = await btfDb.btfPedido.findUnique({ where: { id } });
    if (!p || !claveCoincide(clave, p.clave)) throw new ErrorBtf("no-encontrado", "Ese pedido no existe o la clave no coincide.");
    if (p.estado === "pendiente" && p.metodo === "mercadopago" && (await verificarEnMp(p))) {
      p = await btfDb.btfPedido.findUniqueOrThrow({ where: { id } });
    }
    return json(pedidoRed(p, true));
  });
}
