/**
 * Export CSV de VENTAS POR LOCAL — `GET /admin/locales/ventas/export?desde=…&hasta=…[&local=…]`.
 *
 * El consolidado que la contadora de una marca con varios locales hoy arma a mano juntando el
 * libro de cada uno: resumen por local, por CUIT (si comparten) y el detalle día por día y por
 * medio. Sale de la MISMA lectura que la pantalla (`ventasDeLaRedAction`), así el archivo y la
 * pantalla no pueden decir cosas distintas.
 *
 * Guardias: `requireApp` (el módulo `multilocal` aun con el gate apagado) y `exigirCasa`, que
 * relee el módulo de la base; la action lo repite. El `?local=` se elige entre los locales que
 * salieron de las filas de la casa: un id ajeno responde 404 sin decir si ese negocio existe.
 */

import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { ventasDeLaRedAction } from "@/lib/multilocal/multilocal-actions";
import { consolidarPorCuit, csvVentasDeLaRed, elegirLocal } from "@/lib/multilocal/multilocal-core";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(status: number, cuerpo: string): Response {
  return new Response(cuerpo, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  await requireApp("ventas-por-local");
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return texto(404, casa.error);
  try {
    const params = new URL(request.url).searchParams;
    const r = await ventasDeLaRedAction({ desde: params.get("desde"), hasta: params.get("hasta") });
    if (!r.ok) return texto(503, r.error);
    const eleccion = elegirLocal(
      r.locales.map((l) => l.local),
      params.get("local"),
    );
    if (!eleccion.ok) return texto(404, eleccion.error);
    const elegido = eleccion.local;
    const locales = elegido ? r.locales.filter((l) => l.local.localTenantId === elegido.localTenantId) : r.locales;
    const csv = csvVentasDeLaRed({
      casa: r.casa,
      rango: r.rango,
      locales,
      porCuit: elegido ? [] : consolidarPorCuit(locales),
    });
    const nombre = `ventas-por-local-${r.rango.desde}-a-${r.rango.hasta}${elegido ? `-${elegido.slug}` : ""}`;
    // BOM UTF-8 para que Excel en Windows abra los acentos (mismo criterio que el libro de caja).
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("locales", "no se pudo generar el archivo de ventas por local", err);
    return texto(500, "No se pudo generar el archivo. Probá de nuevo en un rato; si sigue, avisanos.");
  }
}
