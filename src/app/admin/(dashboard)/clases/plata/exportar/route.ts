/**
 * Exportar los cobros — `GET /admin/clases/plata/exportar?periodo=mes` (M-075).
 *
 * Una fila por cobro (fecha, hora, alumno, medio, monto) y el total: lo que el profe le pasa al
 * contador o mira en el Excel. Mismo período y mismo filtro que la pantalla de Plata.
 *
 * Guardia: la de la app (requireApp, como la pantalla) y la lectura va acotada por el negocio.
 */

import { requireApp } from "@/lib/require-app";
import { logger } from "@/lib/logger";
import { CSV_BOM, csvCobros, nombreArchivo, periodoDe } from "../periodo";
import { cobrosDelPeriodo } from "../datos.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireApp("padel-clases");
  try {
    const periodo = periodoDe(new URL(request.url).searchParams.get("periodo"));
    const { hoy, filas } = await cobrosDelPeriodo(periodo);
    return new Response(CSV_BOM + csvCobros(filas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombreArchivo(periodo, hoy)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("padel cobros export failed", err instanceof Error ? err.message : String(err));
    return new Response("No se pudo armar el archivo. Probá de nuevo en un rato.", { status: 500 });
  }
}
