/**
 * Export CSV del reporte del dueño — `GET /admin/reportes/export?dias=90`.
 *
 * Reúne la facturación (`getReportData`) y los KPIs profundos (`getDeepReportData`)
 * del período y los devuelve como `text/csv` descargable. Ambas server actions ya
 * exigen la capability `reports:read` y scopean por tenant, así que la autorización
 * y el aislamiento son los mismos que la página `/admin/reportes`. El armado del
 * texto vive en `report-csv.ts` (lógica pura, testeada).
 */

import { getReportData, getDeepReportData } from "@/lib/actions";
import { REPORT_RANGE_DAYS, DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import { buildReportCsv } from "@/lib/report-csv";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const parsed = Number(new URL(request.url).searchParams.get("dias"));
    const rangeDays = (REPORT_RANGE_DAYS as readonly number[]).includes(parsed)
      ? parsed
      : DEFAULT_REPORT_RANGE_DAYS;

    const [data, deep] = await Promise.all([
      getReportData(rangeDays),
      getDeepReportData(rangeDays),
    ]);

    const csv = buildReportCsv({
      desde: data.desde,
      hasta: data.hasta,
      rangeDays,
      totalIngresos: data.totalIngresos,
      cantidadPagos: data.cantidadPagos,
      totalTurnos: deep.totalTurnos,
      porDia: data.porDia,
      porProfesional: data.porProfesional,
      porServicio: data.porServicio,
      kpis: deep.kpis,
    });

    const filename = `reporte-${data.hasta.toISOString().slice(0, 10)}-${rangeDays}d.csv`;
    // BOM UTF-8 para que Excel en Windows abra los acentos correctamente.
    return new Response("﻿" + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // requireCapability lanza si no está autorizado: no filtramos el detalle.
    logger.error("reportes/export", "no se pudo generar el CSV", err);
    return new Response("No se pudo generar el reporte.", { status: 403 });
  }
}
