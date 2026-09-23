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
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz, dateStrInBusinessTz } from "@/lib/datetime";
import { getNegocioApps } from "@/apps/contexto.server";
import { getTenantBrand } from "@/lib/branding";
import { leerVentasMostrador } from "@/lib/reports/ventas-mostrador-lectura";
import { csvVentasMostrador } from "@/lib/reports/ventas-mostrador";
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  const user = await requireApp("reportes");
  try {
    const parsed = Number(new URL(request.url).searchParams.get("dias"));
    const rangeDays = (REPORT_RANGE_DAYS as readonly number[]).includes(parsed)
      ? parsed
      : DEFAULT_REPORT_RANGE_DAYS;

    // Un local de MOSTRADOR exporta lo que ve su pantalla: las ventas cobradas del período,
    // por día, medio y producto (ReportesMostrador.tsx). El de servicios sigue igual.
    const { esMostrador } = await getNegocioApps(user.role);
    if (esMostrador) {
      const tenantId = await getCurrentTenantId();
      const [r, brand] = await Promise.all([
        leerVentasMostrador(prisma, tenantId, todayInBusinessTz(), rangeDays),
        getTenantBrand(),
      ]);
      const desde = dateStrInBusinessTz(r.desde);
      const hasta = dateStrInBusinessTz(r.hasta);
      return new Response(BOM + csvVentasMostrador(r, { desde, hasta, negocio: brand.name }), {
        status: 200,
        headers: cabecerasCsv(`ventas-${hasta}-${rangeDays}d.csv`),
      });
    }

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
