// La suscripción al calendario de cada persona. Sin sesión: la llave es el token, firmado por negocio y persona. Una cuenta
// dada de baja deja de responder. Nunca incluye montos.

import { getCurrentTenantId } from "@/lib/tenant";
import { calendarioIcs } from "@/lib/proyectos/gestion-core";
import { entradaParaSuscripcion } from "@/lib/proyectos/gestion-lecturas-core";
import { actorDeUsuario, entradasCalendario, rangoDeSuscripcion, usuarioDelCalendario } from "@/lib/proyectos/gestion-lecturas.server";

export const dynamic = "force-dynamic";

const noEncontrado = () => new Response("No encontrado", { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const tenantId = await getCurrentTenantId();
    const userId = usuarioDelCalendario(tenantId, token);
    if (!userId) return noEncontrado();
    const actor = await actorDeUsuario(tenantId, userId);
    if (!actor) return noEncontrado();
    const { desde, hasta } = rangoDeSuscripcion();
    const entradas = await entradasCalendario(actor, desde, hasta, false);
    return new Response(calendarioIcs("Eventos y agenda", entradas.map(entradaParaSuscripcion)), {
      headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
    });
  } catch {
    return noEncontrado();
  }
}
