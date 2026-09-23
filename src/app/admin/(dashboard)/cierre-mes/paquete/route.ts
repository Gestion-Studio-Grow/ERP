/**
 * El PAQUETE DEL MES para el contador — `GET /admin/cierre-mes/paquete?mes=2026-08`.
 *
 * Un CSV con `;` y BOM (abre bien en Excel) con todo el mes: la lista de control, el libro
 * de caja, el Libro IVA (ventas con y sin comprobante, compras), las cuentas corrientes y el
 * stock valorizado. Lo arma `cierre-mes/paquete.ts` (puro, probado). Si el mes no está
 * congelado, el archivo lo dice arriba y se llama "...-borrador.csv".
 *
 * Cada descarga queda en la auditoría con quién la bajó ("descargado por"): es lo que
 * muestra el paso 8 y el botón del Inicio. Se registra DESPUÉS de armar el archivo: una
 * descarga que falló no cuenta.
 *
 * Misma guardia que la pantalla (`requireApp("cierre-del-mes")`), y sólo meses que ya
 * terminaron.
 */

import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { getNegocioApps } from "@/apps/contexto.server";
import { esMesKey } from "@/lib/libros/fecha-fiscal";
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";
import { estadoDesdeAuditoria, evaluarPasos, mesCerrable } from "@/lib/cierre-mes/cierre-mes";
import { leerAuditoriaCierre, leerHechosCierreMes } from "@/lib/cierre-mes/lectura";
import { leerDatosPaquete, registrarDescarga } from "@/lib/cierre-mes/paquete-lectura";
import { armarPaquete, nombreDelPaquete } from "@/lib/cierre-mes/paquete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXTO = { "Content-Type": "text/plain; charset=utf-8" };

export async function GET(request: Request) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  const user = await requireApp("cierre-del-mes");
  const ahora = new Date();
  const mes = new URL(request.url).searchParams.get("mes");
  if (!esMesKey(mes) || !mesCerrable(mes, ahora)) {
    return new Response("Elegí un mes que ya terminó desde Cierre del mes.", { status: 400, headers: TEXTO });
  }
  try {
    const tenantId = await getCurrentTenantId();
    const [negocio, tenant, filas] = await Promise.all([
      getNegocioApps(user.role),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
      leerAuditoriaCierre(prisma, tenantId, mes),
    ]);
    const hechos = await leerHechosCierreMes(prisma, tenantId, mes, { esMostrador: negocio.esMostrador });
    const pasos = evaluarPasos(hechos, estadoDesdeAuditoria(filas));
    const datos = await leerDatosPaquete(tenantId, mes, { negocio: tenant?.name ?? "", pasos, ahora });
    const cuerpo = armarPaquete(datos);
    const borrador = !datos.estado.congelado;
    await registrarDescarga(prisma, tenantId, mes, { actor: `user:${user.id}`, por: user.name, borrador });
    return new Response(BOM + cuerpo, { status: 200, headers: cabecerasCsv(nombreDelPaquete(mes, tenant?.slug ?? "", borrador)) });
  } catch (err) {
    logger.error("cierre-mes/paquete", "no se pudo armar el paquete del mes", err);
    return new Response("No se pudo armar el paquete. Volvé a intentar en un momento; si sigue, avisanos.", {
      status: 500,
      headers: TEXTO,
    });
  }
}
