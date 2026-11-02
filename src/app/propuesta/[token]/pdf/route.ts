// La propuesta en PDF para el cliente: el link es la llave, y no lleva costos.

import { NextResponse } from "next/server";
import { fechaCorta } from "@/lib/proyectos/core";
import { papelDeLaPropuesta } from "@/lib/proyectos/ficha.server";
import { pdfDeCotizacion } from "@/lib/proyectos/papel-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await papelDeLaPropuesta(token).catch(() => null);
  if (!d) return new NextResponse("No encontrado", { status: 404 });
  const bytes = await pdfDeCotizacion({ ...d, fechaEvento: d.proyecto.fechaEvento ? fechaCorta(d.proyecto.fechaEvento) : null });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="propuesta-${d.codigo}-v${d.version}.pdf"`, "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
