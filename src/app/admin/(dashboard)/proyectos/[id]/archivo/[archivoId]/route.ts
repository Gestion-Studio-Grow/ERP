// Una imagen o un PDF del proyecto, de a uno: así la tabla de archivos no carga megas en la página. Pide los mismos permisos que la pestaña.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { actorActual, proyectoVisible, puede } from "@/lib/proyectos/gestion.server";
import { cabeceraDeArchivo, comoSeEntrega, MINUTOS_BAJADA, urlFirmada } from "@/lib/proyectos/r2-core";
import { configR2 } from "@/lib/proyectos/r2.server";
import { SIN_COMPROBANTES } from "@/lib/proyectos/rendiciones-core";

export const dynamic = "force-dynamic";

export async function GET(pedido: Request, { params }: { params: Promise<{ id: string; archivoId: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const { id, archivoId } = await params;
  if (!(puede(a, "ficha", "ver") || puede(a, "diseno", "ver")) || !(await proyectoVisible(a, id))) return new NextResponse(null, { status: 404 });
  // Los comprobantes de Rendí no salen por acá: se ven sólo desde Rendiciones (quien rindió, Dirección o Administración).
  const f = await prisma.proyectoArchivo.findFirst({ where: { id: archivoId, proyectoId: id, tenantId: a.tenantId, ...SIN_COMPROBANTES }, select: { datos: true, clave: true, nombre: true } });
  // El original está en la nube: un link que vence a los minutos, pedido después de controlar el permiso. ?mini=1 es la miniatura de la tabla.
  const c = configR2();
  if (c && f?.clave && !(f.datos && new URL(pedido.url).searchParams.has("mini"))) {
    const { tipo, disposicion } = comoSeEntrega(f.nombre);
    const url = urlFirmada(c, { metodo: "GET", clave: f.clave, ahora: new Date(), segundos: MINUTOS_BAJADA * 60, consulta: { "response-content-disposition": cabeceraDeArchivo(f.nombre, disposicion), "response-content-type": tipo } });
    return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  }
  const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(f?.datos ?? "");
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
