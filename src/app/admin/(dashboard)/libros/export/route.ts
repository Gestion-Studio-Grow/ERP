/**
 * Export ESTRUCTURADO del Libro IVA al contador — `GET /admin/libros/export?dias=90`.
 *
 * Formato estructurado (secciones Ventas/Compras + subtotales + resumen IVA), NO un CSV
 * plano (ADR-060 D7). `getLibroIva` ya exige `reports:read` y scopea por tenant; además
 * se restringe a la edición Empresa (perfilMin=enterprise). El armado del texto vive en
 * `libro-iva-export.ts` (puro, testeado).
 */

import { getLibroIva } from "@/lib/libros/libro-iva-loader";
import { buildLibroIvaExport } from "@/lib/libros/libro-iva-export";
import { getActiveProfile } from "@/lib/profile-gating";
import { getTenantBrand } from "@/lib/branding";
import { REPORT_RANGE_DAYS, DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Edición Empresa (igual que la pantalla). No filtramos el detalle si no aplica.
    if ((await getActiveProfile()) !== "enterprise") {
      return new Response("No disponible en tu edición.", { status: 403 });
    }

    const parsed = Number(new URL(request.url).searchParams.get("dias"));
    const rangeDays = (REPORT_RANGE_DAYS as readonly number[]).includes(parsed) ? parsed : DEFAULT_REPORT_RANGE_DAYS;

    const [{ libro, desde, hasta }, brand] = await Promise.all([getLibroIva(rangeDays), getTenantBrand()]);
    const body = buildLibroIvaExport(libro, { desde, hasta, tenant: brand.name });

    // BOM UTF-8 para que Excel en Windows abra los acentos correctamente.
    return new Response("﻿" + body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="libro-iva-${desde}_a_${hasta}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // requireCapability (dentro de getLibroIva) lanza si no está autorizado.
    logger.error("libros/export", "no se pudo generar el Libro IVA", err);
    return new Response("No se pudo generar el Libro IVA.", { status: 403 });
  }
}
