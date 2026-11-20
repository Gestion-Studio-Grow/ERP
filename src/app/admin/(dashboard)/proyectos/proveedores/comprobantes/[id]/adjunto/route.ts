// El PDF o la foto del comprobante de proveedor (O27). Mismo permiso que la pantalla: ver Proveedores y ver la plata.
import { NextResponse } from "next/server";
import { requireApp } from "@/lib/require-app";
import { adjuntoDe, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { cabeceraDeArchivo } from "@/lib/proyectos/r2-core";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";

export const dynamic = "force-dynamic";

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApp("gestion-proveedores");
  const a = await actorActual();
  if (!puede(a, "proveedores", "ver") || !(await veLaPlata(a.user))) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  const f = await siHayM1(() => adjuntoDe(a.tenantId, id));
  if (!f) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(f.datos), {
    headers: { "Content-Type": f.tipoMime, "Content-Disposition": cabeceraDeArchivo(f.nombre, "inline"), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
