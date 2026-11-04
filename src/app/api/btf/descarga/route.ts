// GET /api/btf/descarga?pedido&clave&medio → 302 al GET prefirmado (600 s) del original, como adjunto con su
// nombre de archivo. Exige: pedido pagado + clave (tiempo constante) + medio dentro del pedido. Todo lo demás: 404.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, manejar } from "@/lib/btf/http";
import { claveCoincide } from "@/lib/btf/pagos";
import { configS3, urlFirmadaDescarga } from "@/lib/btf/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const q = new URL(request.url).searchParams;
    const pedidoId = q.get("pedido") ?? "";
    const medioId = q.get("medio") ?? "";
    const p = pedidoId ? await btfDb.btfPedido.findUnique({ where: { id: pedidoId } }) : null;
    const noHay = new ErrorBtf("no-encontrado", "Ese pedido no existe, la clave no coincide o todavía no está pagado.");
    if (!p || !claveCoincide(q.get("clave"), p.clave)) throw noHay;
    if (p.estado !== "pagado") throw noHay;
    if (!p.items.includes(medioId)) throw new ErrorBtf("no-encontrado", "Esa foto no está en tu pedido.");
    const m = await btfDb.btfMedio.findUnique({ where: { id: medioId } });
    if (!m || m.albumId !== p.albumId) throw new ErrorBtf("no-encontrado", "Esa foto ya no está disponible.");
    const url = urlFirmadaDescarga(configS3()!.bucketOriginales, m.claveOriginal, m.nombreArchivo, 600);
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  });
}
