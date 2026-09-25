// El comprobante de un día cerrado, con sus números (comprobante.ts). La MISMA fila de la auditoría
// que lee `getCierreDiarioData` para las frases del cierre (entidad CierreDiario, el día), filtrada
// por negocio. Sólo con el diseño nuevo y sólo si el día está cerrado.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { CIERRE_DIARIO_ENTITY } from "@/lib/caja/frontera-cierre";
import { mediosDelComprobante, type MedioDelComprobante } from "./comprobante";

export async function leerMediosDelComprobante(day: string): Promise<MedioDelComprobante[] | null> {
  const tenantId = await getCurrentTenantId();
  const fila = await prisma.auditLog.findFirst({
    where: { tenantId, entity: CIERRE_DIARIO_ENTITY, entityId: day },
    orderBy: { createdAt: "desc" },
    select: { changes: true },
  });
  return fila ? mediosDelComprobante(fila.changes) : null;
}
