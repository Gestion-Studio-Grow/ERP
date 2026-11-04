// POST /api/btf/a/:slug/cotizar { items: medioId[], cupon } → Cotizacion, calculada en el servidor
// (los cupones nunca viajan al comprador).
import { exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, leerCuerpo, manejar } from "@/lib/btf/http";
import { albumRed } from "@/lib/btf/mapeo";
import { cotizar } from "@/lib/btf/precios";
import { albumPublicoPorSlug } from "../publico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { slug } = await params;
    const c = await leerCuerpo(request);
    if (!Array.isArray(c.items) || c.items.length > 2000 || !c.items.every((i) => typeof i === "string")) {
      throw new ErrorBtf("invalido", "Revisá el carrito.");
    }
    const { album, medios } = await albumPublicoPorSlug(slug);
    const porId = new Map(medios.map((m) => [m.id, m]));
    const items = [...new Set(c.items as string[])].map((id) => porId.get(id));
    if (items.some((m) => !m)) throw new ErrorBtf("invalido", "Alguna foto del carrito ya no está en el álbum. Revisá el carrito.");
    const cupon = typeof c.cupon === "string" && c.cupon.trim() ? c.cupon.trim().slice(0, 20) : null;
    return json(cotizar(albumRed(album), items.map((m) => ({ tipo: m!.tipo as "foto" | "video" })), cupon, medios.length));
  });
}
