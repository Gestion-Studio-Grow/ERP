// «Agregar al calendario» (A·E29): el .ics de UNA clase del alumno, sin dependencias. Sólo con el
// token vigente de ESTE negocio y una clase viva de ESE alumno; cualquier otra cosa, 404 (no dice si
// el token o la clase existen). Hora con TZID America/Argentina/Buenos_Aires (core.ts → armarIcs).

import { getCurrentTenantId } from "@/lib/tenant";
import { requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { claseParaCalendario } from "@/lib/padel/datos.server";
import { armarIcs } from "@/lib/padel/core";

export const dynamic = "force-dynamic";

// Dos lecturas por pedido: por IP, 30 cada 10 minutos.
const freno = createRateLimiter({ max: 30, windowMs: 10 * 60 * 1000 });

const noEncontrado = () => new Response("No encontramos esa clase.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; claseId: string }> }): Promise<Response> {
  const { token, claseId } = await params;
  const tenantId = await getCurrentTenantId();
  const clave = `padel-ics:${tenantId}:${(await requestIp()) ?? "sin-ip"}`;
  if (freno.blocked(clave)) return new Response("Probá de nuevo en unos minutos.", { status: 429, headers: { "Cache-Control": "no-store" } });
  freno.fail(clave);
  const d = await claseParaCalendario(token, claseId);
  if (!d) return noEncontrado();
  const ics = armarIcs({
    uid: `${d.clase.id}@clases-padel`,
    empiezaEn: d.clase.empiezaEn,
    terminaEn: d.clase.terminaEn,
    titulo: `Clase de pádel · ${d.negocio.nombre}`,
    descripcion: d.clase.estado === "PEDIDA" ? "Pedida: falta que el profe la confirme." : "Confirmada.",
    lugar: d.negocio.lugar || undefined,
  });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="clase-padel.ics"',
      "Cache-Control": "no-store",
    },
  });
}
