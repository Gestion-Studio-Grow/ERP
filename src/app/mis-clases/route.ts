// «Mis clases» del alumno — versión mínima (M-003). La pantalla propia de /mis-clases (VistaAlumno,
// manifiesto del alumno, «Entrá con tu celular») es de la Tanda 3C (matias-DISENO.md §3C): hasta
// entonces esta ruta lee la cookie `padel_alumno` de ESTE negocio y lleva a la vista que ya existe,
// /alumno/<token>. Sin cookie, o con un link que ya no anda (se regeneró: O-1), vuelve al turnero
// con «Pedí tu link» abierto. El token sólo viaja al navegador que ya lo tenía en su cookie.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { leerTokenCookie } from "@/lib/padel/sesion-alumno.server";
import { destinoMisClases } from "@/lib/padel/sesion-alumno";

export const dynamic = "force-dynamic";

// Una lectura por visita: por IP, 30 cada 10 minutos.
const freno = createRateLimiter({ max: 30, windowMs: 10 * 60 * 1000 });

export async function GET(): Promise<Response> {
  const token = await leerTokenCookie();
  let vigente = false;
  if (token) {
    const tenantId = await getCurrentTenantId();
    const clave = `padel-mis-clases:${tenantId}:${(await requestIp()) ?? "sin-ip"}`;
    if (!freno.blocked(clave)) {
      freno.fail(clave);
      vigente = Boolean(await prisma.padelAlumno.findFirst({ where: { tenantId, token }, select: { id: true } }));
    }
  }
  // Location relativa: detrás del proxy, request.url puede traer el host interno.
  return new Response(null, { status: 303, headers: { Location: destinoMisClases(vigente ? token : null), "Cache-Control": "no-store" } });
}
