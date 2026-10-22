// «Agregar al calendario» desde el link de WhatsApp: el .ics de una clase de ESE alumno en ESTE
// negocio (la lógica, el freno y el 404 viven en alumno/_vista/calendario.ts).

import { respuestaIcs } from "@/app/alumno/_vista/calendario";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; claseId: string }> }): Promise<Response> {
  const { token, claseId } = await params;
  return respuestaIcs(token, claseId);
}
