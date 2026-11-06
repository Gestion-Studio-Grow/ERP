import type { NextRequest } from "next/server";

/** El origen público del pedido (detrás del proxy de Vercel). El host ya lo resolvió el negocio. */
export function origenDelPedido(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}
