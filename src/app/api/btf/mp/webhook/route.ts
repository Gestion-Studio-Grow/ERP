// POST /api/btf/mp/webhook — aviso de Mercado Pago. Responde 200 SIEMPRE (MP reintenta si no) y nunca confía
// en el cuerpo: sólo dispara la re-consulta a MP con el token del fotógrafo (src/lib/btf/pagos.ts).
//  - Con `?pedido=<id>` válido: verifica ese pedido por external_reference.
//  - Sin `?pedido=` válido: 200 y no hace nada. La `notification_url` de cada preferencia SIEMPRE lleva el
//    pedido (cuerpoPreferencia), así que un aviso sin él no es nuestro: no se recorren fotógrafos ni se llama a MP.
import { btfDb, entornoListo } from "@/lib/btf/db";
import { json } from "@/lib/btf/http";
import { verificarEnMp } from "@/lib/btf/pagos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!entornoListo()) return json({ ok: true });
    const pedidoId = new URL(request.url).searchParams.get("pedido");
    if (pedidoId && /^[A-Za-z0-9_-]{1,64}$/.test(pedidoId)) {
      const pedido = await btfDb.btfPedido.findUnique({ where: { id: pedidoId } });
      if (pedido) await verificarEnMp(pedido);
    }
  } catch (e) {
    console.error("[btf] webhook MP:", e instanceof Error ? e.name : typeof e);
  }
  return json({ ok: true });
}
