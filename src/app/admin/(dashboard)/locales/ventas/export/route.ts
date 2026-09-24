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
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";
import { nombreDeArchivo, periodoParaArchivo } from "../../../reportes/nombre-de-archivo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(status: number, cuerpo: string): Response {
  return new Response(cuerpo, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  await requireApp("ventas-por-local");
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return texto(casa.noSeLeyo ? 503 : 404, casa.error);
  try {
    const params = new URL(request.url).searchParams;
    const r = await ventasDeLaRedAction({ desde: params.get("desde"), hasta: params.get("hasta") });
    if (!r.ok) return texto(503, r.error);
    const caido = r.sinLeer.find((l) => l.localTenantId === params.get("local"));
    if (caido) return texto(503, `No se pudo leer ${caido.alias} en este momento. Probá de nuevo en un rato.`);
    const eleccion = elegirLocal(
      r.locales.map((l) => l.local),
      params.get("local"),
    );
    if (!eleccion.ok) return texto(404, eleccion.error);
    const elegido = eleccion.local;
    // Un archivo para la contadora al que le falta un local es peor que ningún archivo: se lo
    // toma como el total. Si un local no se pudo leer, no se baja nada y se dice cuál.
    if (!elegido && r.sinLeer.length > 0) {
      const cuales = r.sinLeer.map((l) => l.alias).join(", ");
      return texto(503, `No se pudo leer ${cuales} en este momento y el archivo saldría incompleto. Probá de nuevo en un rato.`);
    }
    const locales = elegido ? r.locales.filter((l) => l.local.localTenantId === elegido.localTenantId) : r.locales;
    const csv = csvVentasDeLaRed({
      casa: r.casa,
      rango: r.rango,
      locales,
      porCuit: elegido ? [] : consolidarPorCuit(locales),
    });
    // "ventas-por-local-magra-2026-09-01-al-2026-09-24.csv" (o "-canning" si es un solo local).
    const nombre = nombreDeArchivo([
      "ventas-por-local",
      r.casa,
      ...periodoParaArchivo(r.rango.desde, r.rango.hasta),
      elegido ? (elegido.alias || elegido.slug) : null,
    ]);
    // BOM UTF-8 para que Excel en Windows abra los acentos (mismo criterio que el libro de caja).
    return new Response(BOM + csv, { headers: cabecerasCsv(nombre) });
  } catch (err) {
    logger.error("locales", "no se pudo generar el archivo de ventas por local", err);
    return texto(500, "No se pudo generar el archivo. Probá de nuevo en un rato; si sigue, avisanos.");
  }
}
