// El recibo de liquidación en PDF. Las mismas reglas que la pantalla de impresión: un borrador no existe para la persona.

import { NextResponse } from "next/server";
import { fechaCorta } from "@/lib/proyectos/core";
import { datosDelNegocio } from "@/lib/proyectos/datos.server";
import { etiquetaMes, leerExtras } from "@/lib/proyectos/empresa-core";
import { liquidacionParaImprimir } from "@/lib/proyectos/empresa.server";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";
import { pdfDeLiquidacion } from "@/lib/proyectos/papel-pdf";
import { requireApp } from "@/lib/require-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const { id } = await params;
  const l = await liquidacionParaImprimir(a.tenantId, id);
  const propia = l?.personaId === a.personaId && l?.estado === "PUBLICADA";
  if (!l || (!propia && !puede(a, "liquidaciones", "ver"))) return new NextResponse("No encontrado", { status: 404 });
  const negocio = await datosDelNegocio(a.tenantId);
  const bytes = await pdfDeLiquidacion({
    negocio: negocio.nombre,
    periodo: etiquetaMes(l.periodo),
    estado: l.estado === "PUBLICADA" ? `Publicada el ${fechaCorta(l.publicadaEl)}` : "Borrador, sin publicar",
    persona: l.persona.nombre,
    puesto: l.persona.puesto,
    facturaA: l.facturaA,
    base: l.base,
    extras: leerExtras(l.extras),
    total: l.total,
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="liquidacion-${l.periodo}.pdf"`, "cache-control": "no-store" },
  });
}
