/**
 * Export CSV del LIBRO DE CAJA — `GET /admin/caja/libro/export?mes=2026-09`
 * o de UN día — `GET /admin/caja/libro/export?dia=2026-09-07`.
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
import { dateStrInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const dia = params.get("dia");
    const esDia = dia != null && /^\d{4}-\d{2}-\d{2}$/.test(dia);
    // Un ?mes inválido cae al mes corriente, igual que la pantalla. El export de un día se
    // sirve desde el MISMO libro mensual y después se filtra: así el saldo corrido de cada
    // fila sigue siendo el del mes —que es el número que la contadora necesita— en vez de
    // uno que arranque de cero cada mañana.
    const libro = await getLibroCajaData(esDia ? dia.slice(0, 7) : params.get("mes"));
    const alcance = esDia
      ? { ...libro, rows: libro.rows.filter((r) => dateStrInBusinessTz(r.occurredAt) === dia) }
      : libro;
    const csv = buildLibroCsv(alcance, {
      methodLabel: (m) => CASH_METHOD_LABEL[m],
      monthLabel: esDia
        ? `día ${dia} (el RESUMEN de arriba es el de ${formatMonthLabel(libro.year, libro.month)} completo)`
        : formatMonthLabel(libro.year, libro.month),
      totalOf,
    });
    const nombre = esDia ? `libro-de-caja-${dia}` : `libro-de-caja-${libro.monthKey}`;

    // BOM UTF-8 para que Excel en Windows abra los acentos correctamente (mismo
    // criterio que el export de Reportes).
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("libro-caja export failed", err instanceof Error ? err.message : String(err));
    return new Response("No se pudo generar el export.", { status: 500 });
  }
}
