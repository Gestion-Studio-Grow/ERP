/**
 * Export CSV del LIBRO DE CAJA — `GET /admin/caja/libro/export?mes=2026-09`.
 *
 * Existe por un pedido concreto de la contadora del cliente, y la cita vale como
 * requisito: sin esto, "o me da su usuario de dueña o me manda 280 renglones en
 * capturas de WhatsApp". Una pantalla que muestra la caja del mes y no la deja
 * sacar obliga a la peor de las dos cosas.
 *
 * Devuelve los MOVIMIENTOS, no agregados: es lo que la contadora necesita para
 * clasificar e imputar. El export de `/admin/reportes` es complementario (totales
 * por día/profesional/servicio) y no lo reemplaza.
 *
 * Autorización y aislamiento: reusa `getLibroCajaData`, que ya exige la capability
 * `orders:read` y scopea por tenant. No hay una segunda consulta que pueda escaparse
 * del tenant.
 */

import { getLibroCajaData } from "@/lib/libro-caja-actions";
import { CASH_METHOD_LABEL, formatMonthLabel, totalOf } from "@/lib/caja/libro-caja";
import { buildLibroCsv } from "@/lib/caja/libro-csv";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const mes = new URL(request.url).searchParams.get("mes");
    // Un ?mes inválido cae al mes corriente, igual que la pantalla.
    const libro = await getLibroCajaData(mes);
    const csv = buildLibroCsv(libro, {
      methodLabel: (m) => CASH_METHOD_LABEL[m],
      monthLabel: formatMonthLabel(libro.year, libro.month),
      totalOf,
    });

    // BOM UTF-8 para que Excel en Windows abra los acentos correctamente (mismo
    // criterio que el export de Reportes).
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="libro-de-caja-${libro.monthKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("libro-caja export failed", err instanceof Error ? err.message : String(err));
    return new Response("No se pudo generar el export.", { status: 500 });
  }
}
