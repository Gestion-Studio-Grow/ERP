// La página de una dirección sin negocio (src/lib/gsg/pagina-sin-negocio.ts). Llega por dos caminos:
//   · el apex (`gsgapp.com.ar`, `www.`): `proxy.ts` reescribe `/` acá, sin consultar la base;
//   · un subdominio que no resuelve a ningún negocio: el layout del sitio público lo manda acá.
// El apex responde 200 (es la portada de GSG); un subdominio sin negocio, 404 y sin indexar. La página no lee nada de
// ningún negocio: sólo el host del pedido para mostrarlo.
import { extractSubdomain } from "@/lib/tenant";
import { htmlSinNegocio } from "@/lib/gsg/pagina-sin-negocio";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const esApex = extractSubdomain(host) === null;
  const html = htmlSinNegocio({ host, whatsappGsg: process.env.WHATSAPP_GSG?.trim() || null });
  return new Response(html, {
    status: esApex ? 200 : 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      ...(esApex ? {} : { "x-robots-tag": "noindex" }),
    },
  });
}
