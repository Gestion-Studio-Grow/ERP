// «Agregar al calendario» desde /mis-clases: el token sale de la cookie httpOnly de este teléfono
// (nunca de la página). Misma regla que el link: sólo una clase viva de ese alumno en este negocio.

import { leerTokenCookie } from "@/lib/padel/sesion-alumno.server";
import { respuestaIcs } from "@/app/alumno/_vista/calendario";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ claseId: string }> }): Promise<Response> {
  const { claseId } = await params;
  return respuestaIcs(await leerTokenCookie(), claseId);
}
