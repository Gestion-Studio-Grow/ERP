// La cotización en PDF, generada en el servidor. Sin costos, como el papel.

import { NextResponse } from "next/server";
import { fechaCorta } from "@/lib/proyectos/core";
import { planillaParaPapel } from "@/lib/proyectos/ficha.server";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { pdfDeCotizacion } from "@/lib/proyectos/papel-pdf";
import { requireApp } from "@/lib/require-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  const { id } = await params;
  const d = await planillaParaPapel(a, id, new URL(request.url).searchParams.get("version"));
  if (!d) return new NextResponse("No encontrado", { status: 404 });
  const bytes = await pdfDeCotizacion({ ...d, fechaEvento: d.proyecto.fechaEvento ? fechaCorta(d.proyecto.fechaEvento) : null });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="cotizacion-${d.codigo}-v${d.version}.pdf"`, "cache-control": "no-store" },
  });
}
