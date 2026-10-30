// La página de una dirección con negocio cuando la base no responde (P0 ronda 2, fail-open). Llega por redirect desde el
// layout del sitio público (src/app/(site)/layout.tsx) cuando no se puede saber si el host lleva a un negocio. Antes ese
// «no sé» se trataba como «sí» y cualquier host pintaba la landing de CH. 503 + Retry-After + noindex: es una caída, no
// una página. No lee nada de la base: sólo el host del pedido para mostrarlo.
import { htmlSinServicio } from "@/lib/gsg/pagina-sin-negocio";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return new Response(htmlSinServicio({ host }), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "60",
      "x-robots-tag": "noindex",
    },
  });
}
