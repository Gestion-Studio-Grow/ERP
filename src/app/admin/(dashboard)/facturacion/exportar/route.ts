/**
 * CSV de la lista de comprobantes — `GET /admin/facturacion/exportar?<los mismos filtros>`.
 *
 * Baja EXACTAMENTE lo que muestra la lista con esos filtros (lista-core.ts), todas las páginas,
 * hasta `TOPE_CSV` (20.000) renglones. Si el filtro tiene más, la primera línea del archivo lo
 * dice y hay que acotar el período: el archivo nunca aparenta estar completo sin estarlo.
 * Separador `;`, coma decimal y BOM, como los libros (libros/csv-ar.ts).
 *
 * Autorización: la app de Facturación (`requireApp`) y el permiso de facturar (`billing:manage`),
 * los mismos que la pantalla. Aislamiento: la consulta corre en la transacción del negocio
 * (RLS + `"tenantId" = ...`, lista.server.ts).
 */

import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { BOM, cabecerasCsv, filaCsv } from "@/lib/libros/csv-ar";
import { CABECERA_CSV, TOPE_CSV, camposCsv, leerFiltros } from "@/lib/facturacion/lista-core";
import { leerParaExportar } from "@/lib/facturacion/lista.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireApp("facturacion");
  await requireCapability("billing:manage");
  try {
    const sp = Object.fromEntries(new URL(request.url).searchParams);
    const hoy = todayInBusinessTz();
    const filtros = leerFiltros(sp, hoy);
    const { renglones, recortado } = await leerParaExportar(await getCurrentTenantId(), filtros);
    const lineas = [
      ...(recortado
        ? [filaCsv(`ATENCIÓN: el filtro tiene más de ${TOPE_CSV} comprobantes y este archivo trae sólo los ${TOPE_CSV} más nuevos. Acotá las fechas y bajalo por partes.`)]
        : []),
      filaCsv(...CABECERA_CSV),
      ...renglones.map((r) => filaCsv(...camposCsv(r))),
    ];
    const periodo = filtros.desde || filtros.hasta ? `${filtros.desde ?? "inicio"}_a_${filtros.hasta ?? hoy}` : "todos";
    return new Response(BOM + lineas.join("\r\n") + "\r\n", { headers: cabecerasCsv(`comprobantes-${periodo}.csv`) });
  } catch (err) {
    logger.error("facturacion", "no se pudo armar el CSV de comprobantes", err);
    return new Response("No se pudo armar el archivo. Probá de nuevo en un rato.", { status: 500 });
  }
}
