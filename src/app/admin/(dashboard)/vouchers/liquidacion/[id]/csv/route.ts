/**
 * Planilla del lunes — `GET /admin/vouchers/liquidacion/<id>/csv`
 *
 * La liquidación semanal para mandarle a la administradora del country (BOM UTF-8, `;`, fórmulas
 * neutralizadas: abre bien en el Excel argentino). Guardia: app «vouchers» + `cash:manage` +
 * interruptor «vouchers» (apagado = 404); scopeada por tenant (`leerLiquidacion`).
 */

import { unstable_rethrow } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { leerLiquidacion } from "@/lib/vouchers/liquidacion-repo";
import { csvDelReporteDelLunes } from "@/lib/vouchers/liquidacion-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApp("vouchers");
  await requireCapability("cash:manage");
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return new Response("No encontrado.", { status: 404 });
  try {
    const { id } = await params;
    const l = await leerLiquidacion(await getCurrentTenantId(), id);
    if (!l) return new Response("No encontrado.", { status: 404 });
    const csv = csvDelReporteDelLunes({
      negocio: l.negocio,
      semana: { desde: l.desde, hasta: l.hasta },
      renglones: l.renglones,
      pago: l.estado === "CONCILIADA" && l.pagado != null ? { pagado: l.pagado, diferencia: l.diferencia ?? 0, fecha: l.pagoFecha, referencia: l.pagoReferencia } : null,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vouchers-liquidacion-${l.desde}-al-${l.hasta}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    unstable_rethrow(err);
    logger.error("vouchers liquidacion csv failed", err instanceof Error ? err.message : String(err));
    return new Response("No se pudo generar la planilla.", { status: 500 });
  }
}
