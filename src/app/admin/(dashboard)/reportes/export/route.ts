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
import { unstable_rethrow } from "next/navigation";
import { nombreDeArchivo, periodoParaArchivo } from "../nombre-de-archivo";

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
    const [{ esMostrador }, brand] = await Promise.all([getNegocioApps(user.role), getTenantBrand()]);
    if (esMostrador) {
      const tenantId = await getCurrentTenantId();
      const r = await leerVentasMostrador(prisma, tenantId, todayInBusinessTz(), rangeDays);
      const desde = dateStrInBusinessTz(r.desde);
      const hasta = dateStrInBusinessTz(r.hasta);
      return new Response(BOM + csvVentasMostrador(r, { desde, hasta, negocio: brand.name }), {
        status: 200,
        // "ventas-magra-2026-08-26-al-2026-09-24.csv": qué, de quién y de cuándo.
        headers: cabecerasCsv(nombreDeArchivo(["ventas", brand.name, ...periodoParaArchivo(desde, hasta)])),
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

    // Los días del negocio (hora argentina): `toISOString` daba el de Greenwich y a la noche el
    // archivo decía mañana.
    const filename = nombreDeArchivo([
      "reportes",
      brand.name,
      ...periodoParaArchivo(dateStrInBusinessTz(data.desde), dateStrInBusinessTz(data.hasta)),
    ]);
    // BOM UTF-8 para que Excel en Windows abra los acentos correctamente.
    return new Response(BOM + csv, { status: 200, headers: cabecerasCsv(filename) });
  } catch (err) {
    // Una guardia que redirige (sin sesión o sin permiso) no es un error del archivo: se deja pasar.
    unstable_rethrow(err);
    logger.error("reportes/export", "no se pudo generar el CSV", err);
    return new Response("No se pudo generar el reporte. Probá de nuevo en un rato; si sigue, avisanos.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
