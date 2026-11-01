// Una imagen del proyecto, de a una: así la tabla de archivos no carga megas en la página. Pide los mismos permisos que la pestaña.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { actorActual, proyectoVisible, puede } from "@/lib/proyectos/gestion.server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; archivoId: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const { id, archivoId } = await params;
  if (!(puede(a, "ficha", "ver") || puede(a, "diseno", "ver")) || !(await proyectoVisible(a, id))) return new NextResponse(null, { status: 404 });
  const f = await prisma.proyectoArchivo.findFirst({ where: { id: archivoId, proyectoId: id, tenantId: a.tenantId }, select: { datos: true } });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(f?.datos ?? "");
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
