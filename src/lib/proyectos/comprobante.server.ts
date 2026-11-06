// ============================================================================
// RENDÍ en MIA — la foto del comprobante de UNA rendición. Los COMPROBANTE están fuera de las rutas generales de
// archivos (`SIN_COMPROBANTES`): ésta es la única puerta. La ven quien rindió y Dirección/Administración, siempre del
// negocio de la sesión. Diseño, el resto del equipo y otro negocio reciben lo mismo que si no existiera.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { actorActual } from "./gestion.server";
import { faltaLaMigracion, veLaRendicion } from "./rendiciones-core";

export const urlDelComprobante = (rendicionId: string): string => `/admin/proyectos/comprobante/${encodeURIComponent(rendicionId)}`;

export async function comprobanteDeRendicion(rendicionId: string): Promise<{ tipo: string; bytes: Buffer } | null> {
  const a = await actorActual();
  try {
    const r = await prisma.proyectoRendicion.findFirst({ where: { id: rendicionId, tenantId: a.tenantId }, select: { personaId: true, archivo: { select: { datos: true, tipo: true } } } });
    if (!r || !veLaRendicion(a.rol, a.personaId, r.personaId) || r.archivo?.tipo !== "COMPROBANTE") return null;
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(r.archivo.datos ?? "");
    return m ? { tipo: m[1], bytes: Buffer.from(m[2], "base64") } : null;
  } catch (e) {
    if (faltaLaMigracion(e)) return null;
    throw e;
  }
}
