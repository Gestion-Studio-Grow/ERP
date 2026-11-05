// FACTOQUE · Vuelta de Mercado Pago: valida state + sesión, canjea el code (con el verificador
// PKCE) y guarda la conexión sellada en ESTE negocio. La cookie del state se borra siempre.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import { conexionMPDisponible, guardarConexionMP } from "@/lib/facturita-mp.server";
import { COOKIE_MP, RUTA_COOKIE_MP, RUTA_CUENTA, decidirVuelta, type AvisoMP } from "@/lib/facturita-mp-flujo";
import { OAuthMPError, canjearCodigoMP, type PedirMP } from "@/plugins/mercadopago/oauth-mp";
import { logger } from "@/lib/logger";
import { origenDelPedido } from "../origen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { tenantId, userId } = await sesionFacturita();
  const origen = origenDelPedido(request);
  const almacen = await cookies();
  const crudo = almacen.get(COOKIE_MP)?.value;

  const ir = (aviso: AvisoMP) => {
    const res = NextResponse.redirect(new URL(`${RUTA_CUENTA}?mp=${aviso}`, origen), 303);
    res.cookies.set(COOKIE_MP, "", { path: RUTA_COOKIE_MP, maxAge: 0 });
    res.headers.set("cache-control", "no-store");
    return res;
  };

  const q = request.nextUrl.searchParams;
  const d = decidirVuelta({ code: q.get("code"), state: q.get("state"), error: q.get("error") }, crudo, { tenantId, userId }, Date.now());
  if (!d.ok) return ir(d.aviso);

  const cfg = conexionMPDisponible();
  if (!cfg) return ir("no_disponible");
  let tokens;
  try {
    tokens = await canjearCodigoMP(cfg, { code: d.code, redirectUri: d.estado.redirectUri, verificador: d.estado.verificador }, fetch as unknown as PedirMP);
  } catch (e) {
    logger.warn("facturita", "no se pudo canjear el código de Mercado Pago", { tenantId, motivo: e instanceof OAuthMPError ? e.motivo : "error" });
    return ir("fallo");
  }
  const r = await guardarConexionMP(tenantId, userId, tokens, cfg);
  if (!r.ok) return ir(r.motivo === "cuenta_en_uso" ? "cuenta_en_uso" : r.motivo === "sin_clave" ? "no_disponible" : "fallo");
  return ir("conectado");
}
