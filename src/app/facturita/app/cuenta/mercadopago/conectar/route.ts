// FACTOQUE · Ida del «Conectar con Mercado Pago»: state + PKCE en cookie httpOnly y redirect a MP.
// Sin credenciales de la app de MP (o sin la llave de integraciones) vuelve a la cuenta con
// «todavía no disponible»: nunca un link roto.

import { NextResponse, type NextRequest } from "next/server";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import { conexionMPDisponible } from "@/lib/facturita-mp.server";
import { COOKIE_MP, RUTA_COOKIE_MP, RUTA_CUENTA, VIDA_ESTADO_MS, serializarEstado, urlDeVuelta } from "@/lib/facturita-mp-flujo";
import { azarUrl, esUrlDeVueltaValida, urlAutorizacionMP } from "@/plugins/mercadopago/oauth-mp";
import { origenDelPedido } from "../origen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { tenantId, userId } = await sesionFacturita();
  const origen = origenDelPedido(request);
  const cfg = conexionMPDisponible();
  const redirectUri = cfg ? urlDeVuelta(cfg.redirectUri, origen) : null;
  if (!cfg || !redirectUri || !esUrlDeVueltaValida(redirectUri)) {
    return NextResponse.redirect(new URL(`${RUTA_CUENTA}?mp=no_disponible`, origen), 303);
  }
  const state = azarUrl();
  const verificador = azarUrl(48);
  const res = NextResponse.redirect(urlAutorizacionMP({ clientId: cfg.clientId, redirectUri, state, verificador }), 303);
  res.cookies.set(COOKIE_MP, serializarEstado({ state, verificador, tenantId, userId, redirectUri, vence: Date.now() + VIDA_ESTADO_MS }), {
    httpOnly: true,
    secure: origen.startsWith("https:"),
    sameSite: "lax", // la vuelta es una navegación de primer nivel desde MP: lax la manda
    path: RUTA_COOKIE_MP,
    maxAge: VIDA_ESTADO_MS / 1000,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
