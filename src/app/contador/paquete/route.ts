/**
 * El paquete del mes de un CLIENTE, para su estudio contable —
 * `GET /contador/paquete?cliente=<id>&mes=2026-08`.
 *
 * La ruta no decide nada: la sesión, el módulo `cartera`, la pertenencia del cliente a la
 * cartera del estudio y la lectura con el GUC del cliente viven en
 * `paqueteDelClienteParaElEstudio` (cierre-mes/paquete-cartera.ts). /contador está en el
 * matcher del proxy (sin sesión, a login).
 */

import { unstable_rethrow } from "next/navigation";
import { logger } from "@/lib/logger";
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";
import { paqueteDelClienteParaElEstudio } from "@/lib/cierre-mes/paquete-cartera";
import { avisoDelPaquete } from "@/lib/cierre-mes/pagina-de-aviso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Se entra por un link: si no se puede bajar, una pantalla con el motivo y «Volver a la cartera».
const PANTALLA = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const r = await paqueteDelClienteParaElEstudio(params.get("cliente"), params.get("mes"), new Date());
    if (!r.ok) return new Response(avisoDelPaquete(r.error), { status: r.status, headers: PANTALLA });
    return new Response(BOM + r.cuerpo, { status: 200, headers: cabecerasCsv(r.archivo) });
  } catch (err) {
    // `requireCapability` redirige (sin sesión o sin permiso) con una excepción de Next: no se traga.
    unstable_rethrow(err);
    logger.error("contador/paquete", "no se pudo armar el paquete del cliente", err);
    return new Response(avisoDelPaquete("No se pudo armar el paquete. Volvé a intentar en un momento; si sigue, avisanos."), {
      status: 500,
      headers: PANTALLA,
    });
  }
}
