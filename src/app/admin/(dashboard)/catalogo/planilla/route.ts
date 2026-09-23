/**
 * Descarga de la planilla de cortes — `GET /admin/catalogo/planilla`.
 *
 * Devuelve el catálogo del local como CSV para Excel (`;`, BOM, coma decimal). El armado del
 * texto es `armarPlanilla` (planilla-core.ts, puro y testeado). Un route handler no pasa por
 * el layout del panel, así que el candado va acá: capacidad `catalog:read` y rubro retail
 * (CH no tiene planilla de cortes). El `where` lleva `tenantId` explícito, además de RLS.
 */

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { todayInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { SELECT_CATALOGO, aProductoDelCatalogo, armarPlanilla } from "@/lib/catalogo/planilla-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Fuera del try: `requireCapability` corta con un redirect (al login o a la home del rol),
  // y un catch que lo tragara devolvería un 403 en vez de mandar a la persona a loguearse.
  await requireCapability("catalog:read");
  try {
    const rubro = await getCurrentTenantRubro();
    if (!rubro.isRetail) return new Response("No disponible para este negocio.", { status: 404 });

    const tenantId = await getCurrentTenantId();
    const filas = await prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: SELECT_CATALOGO,
      orderBy: { name: "asc" },
    });
    const csv = armarPlanilla(filas.map(aProductoDelCatalogo));
    const filename = `cortes-${rubro.slug ?? "local"}-${todayInBusinessTz()}.csv`.replace(/[^a-zA-Z0-9._-]/g, "-");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("catalogo/planilla", "no se pudo generar la planilla", err);
    return new Response("No se pudo generar la planilla.", { status: 500 });
  }
}
