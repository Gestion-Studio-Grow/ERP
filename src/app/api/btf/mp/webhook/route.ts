// POST /api/btf/mp/webhook — aviso de Mercado Pago. Responde 200 SIEMPRE (MP reintenta si no) y nunca confía
// en el cuerpo: sólo dispara la re-consulta a MP con el token del fotógrafo (src/lib/btf/pagos.ts).
//  - Con `?pedido=<id>` (lo ponemos en notification_url): verifica ese pedido por external_reference.
//  - Sin pedido y `type=payment`: busca el pago probando el token de cada fotógrafo (≤ 20). DEUDA: OAuth.
import { btfDb, entornoListo } from "@/lib/btf/db";
import { json } from "@/lib/btf/http";
import { verificarEnMp, verificarPagoSinPedido } from "@/lib/btf/pagos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!entornoListo()) return json({ ok: true });
    const url = new URL(request.url);
    const cuerpo = (await request.json().catch(() => null)) as { type?: unknown; topic?: unknown; data?: { id?: unknown } } | null;
    const tipo = String(cuerpo?.type ?? cuerpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
    const pagoId = String(cuerpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    const pedidoId = url.searchParams.get("pedido");
    if (pedidoId && /^[A-Za-z0-9_-]{1,64}$/.test(pedidoId)) {
      const pedido = await btfDb.btfPedido.findUnique({ where: { id: pedidoId } });
      if (pedido) await verificarEnMp(pedido);
    } else if (tipo === "payment" && pagoId) {
      await verificarPagoSinPedido(pagoId);
    }
  } catch (e) {
    console.error("[btf] webhook MP:", e instanceof Error ? e.name : typeof e);
  }
  return json({ ok: true });
}
