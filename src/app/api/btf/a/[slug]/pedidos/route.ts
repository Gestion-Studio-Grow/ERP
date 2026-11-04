// POST /api/btf/a/:slug/pedidos { items, comprador, cupon, totalEsperado, metodo } → 201 { pedido, pagar? }.
// El total lo recalcula el servidor con `cotizar`; si no coincide con lo que vio el comprador → 422 precio.
// El cupón se valida acá pero se CONSUME al marcar pagado (src/lib/btf/pagos.ts, Serializable).
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, leerCuerpo, manejar, texto } from "@/lib/btf/http";
import { nuevaClave } from "@/lib/btf/ids";
import { albumRed, pedidoRed } from "@/lib/btf/mapeo";
import { comisionDe, crearPreferencia, marcarPagado, origenDe, tokenDelFotografo } from "@/lib/btf/pagos";
import { cotizar } from "@/lib/btf/precios";
import { email as emailValido } from "@/lib/btf/validar";
import type { Prisma } from "@/generated/prisma/client";
import { albumPublicoPorSlug } from "../publico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    exigirServidor();
    const { slug } = await params;
    const c = await leerCuerpo(request);
    if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 2000 || !c.items.every((i) => typeof i === "string")) {
      throw new ErrorBtf("invalido", "El carrito está vacío o no se pudo leer.");
    }
    const comp = c.comprador && typeof c.comprador === "object" ? (c.comprador as Record<string, unknown>) : {};
    const comprador = {
      nombre: texto(comp.nombre, "tu nombre", { max: 120 }),
      email: emailValido(comp.email),
      whatsapp: typeof comp.whatsapp === "string" ? comp.whatsapp.trim().slice(0, 30) : "",
    };
    if (typeof c.totalEsperado !== "number" || !Number.isInteger(c.totalEsperado)) throw new ErrorBtf("invalido", "Falta el total que viste.");
    const metodo = c.metodo === "transferencia" ? "transferencia" : "mercadopago";
    const cuponPedido = typeof c.cupon === "string" && c.cupon.trim() ? c.cupon.trim().slice(0, 20) : null;

    const { album, medios } = await albumPublicoPorSlug(slug);
    const porId = new Map(medios.map((m) => [m.id, m]));
    const ids = [...new Set(c.items as string[])];
    const elegidos = ids.map((id) => porId.get(id));
    if (elegidos.some((m) => !m)) throw new ErrorBtf("invalido", "Alguna foto del carrito ya no está en el álbum. Revisá el carrito.");

    const cot = cotizar(albumRed(album), elegidos.map((m) => ({ tipo: m!.tipo as "foto" | "video" })), cuponPedido, medios.length);
    if (cuponPedido && (cot.errorCupon || !cot.cupon)) throw new ErrorBtf("cupon", cot.errorCupon ?? "El cupón no aplica.");
    if (cot.total !== c.totalEsperado) {
      throw new ErrorBtf("precio", `El total cambió mientras pagabas: ahora es $ ${cot.total.toLocaleString("es-AR")}. Revisalo y confirmá de nuevo.`);
    }

    const f = album.fotografo;
    const token = metodo === "mercadopago" && cot.total > 0 ? await tokenDelFotografo(f.id) : null;
    if (metodo === "mercadopago" && cot.total > 0 && !token) {
      throw new ErrorBtf("invalido", "Este fotógrafo todavía no configuró Mercado Pago. Elegí transferencia o escribile.");
    }

    const clave = nuevaClave();
    let pedido = await btfDb.btfPedido.create({
      data: {
        albumId: album.id,
        fotografoId: f.id,
        items: ids,
        comprador,
        cotizacion: cot as unknown as Prisma.InputJsonValue,
        cupon: cot.cupon?.codigo ?? null,
        total: cot.total,
        comision: comisionDe(f.plan, cot.total),
        estado: "pendiente",
        metodo,
        clave,
      },
    });

    if (cot.total === 0) {
      pedido = (await marcarPagado(pedido.id, "SIN-CARGO")).pedido;
      return json({ pedido: pedidoRed(pedido, true) }, 201);
    }
    if (metodo === "transferencia") return json({ pedido: pedidoRed(pedido, true) }, 201);

    let pref: { id: string; initPoint: string };
    try {
      pref = await crearPreferencia(
        { pedidoId: pedido.id, clave, slug: album.slug, albumNombre: album.nombre, cantidad: ids.length, total: cot.total, comprador, origen: origenDe(request) },
        token!,
      );
    } catch (e) {
      // Sin preferencia no hay cobro posible: el pedido no sirve (y no consumió cupón).
      await btfDb.btfPedido.delete({ where: { id: pedido.id } }).catch(() => undefined);
      throw e;
    }
    pedido = await btfDb.btfPedido.update({ where: { id: pedido.id }, data: { mpPreferenciaId: pref.id } });
    return json({ pedido: pedidoRed(pedido, true), pagar: { initPoint: pref.initPoint } }, 201);
  });
}
