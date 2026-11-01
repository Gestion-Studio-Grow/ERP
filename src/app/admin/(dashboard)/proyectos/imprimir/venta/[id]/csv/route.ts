// La planilla de venta para abrir en Excel. Sin costos, como el papel.

import { NextResponse } from "next/server";
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";
import { csvField } from "@/lib/report-csv";
import { requireApp } from "@/lib/require-app";
import { planillaParaPapel } from "@/lib/proyectos/ficha.server";
import { exigirVer } from "@/lib/proyectos/gestion.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fila = (...c: (string | number)[]) => c.map(csvField).join(";");
const plata = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  const { id } = await params;
  const d = await planillaParaPapel(a, id, new URL(request.url).searchParams.get("version"));
  if (!d) return new NextResponse("No encontrado", { status: 404 });
  const lineas = [
    fila(d.proyecto.nombre, d.proyecto.client.name, d.codigo, `Versión ${d.version}`),
    fila("Rubro", "Detalle", "Cantidad", "Importe"),
    ...d.grupos.flatMap((g) => [...g.lineas.map((l) => fila(g.rubro, l.descripcion, l.cantidad === null ? "" : l.cantidad.toLocaleString("es-AR"), plata(l.importe))), fila(g.rubro, "Subtotal", "", plata(g.subtotal))]),
    fila("", "Neto", "", plata(d.neto)),
    fila("", `IVA ${d.ivaPct}%`, "", plata(d.iva)),
    fila("", "Total", "", plata(d.total)),
  ];
  return new NextResponse(BOM + lineas.join("\r\n") + "\r\n", { headers: cabecerasCsv(`planilla-${d.codigo}-v${d.version}.csv`) });
}
