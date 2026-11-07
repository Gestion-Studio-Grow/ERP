/**
 * Export CSV de los VOUCHERS — `GET /admin/vouchers/export?desde=…&hasta=…&loteId=…&clientId=…&estado=…&numero=…`
 *
 * Lo que CH le manda a La Alameda: mismas columnas y mismos filtros que la pantalla. El CSV lo arma
 * `exportarVouchersCsv` (BOM UTF-8, `;`, fórmulas neutralizadas: abre bien en el Excel argentino),
 * que exige `clients:read`, el interruptor «vouchers» y scopea por tenant. Apagado = 404.
 */

import { unstable_rethrow } from "next/navigation";
import { exportarVouchersCsv } from "@/lib/vouchers/voucher-actions";
import { todayInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { requireApp } from "@/lib/require-app";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { leerFiltrosDeUrl, nombreDelCsv } from "../vouchers-pantalla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  await requireApp("vouchers");
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return new Response("No encontrado.", { status: 404 });
  try {
    const { filtros } = leerFiltrosDeUrl(new URL(request.url).searchParams);
    const r = await exportarVouchersCsv(filtros);
    if (!r.ok) return new Response(r.error, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    // El BOM ya viene puesto por `csvDelReporte`: no se agrega otro.
    return new Response(r.valor, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombreDelCsv(todayInBusinessTz())}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    unstable_rethrow(err);
    logger.error("vouchers export failed", err instanceof Error ? err.message : String(err));
    return new Response("No se pudo generar el export.", { status: 500 });
  }
}
