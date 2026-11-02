// La planilla de venta en Excel. Sin costos, como el papel.

import { NextResponse } from "next/server";
import { requireApp } from "@/lib/require-app";
import { planillaParaPapel } from "@/lib/proyectos/ficha.server";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { libroDePlanilla } from "@/lib/proyectos/planilla-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  const { id } = await params;
  const d = await planillaParaPapel(a, id, new URL(request.url).searchParams.get("version"));
  if (!d) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(libroDePlanilla(d)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="planilla-${d.codigo}-v${d.version}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
