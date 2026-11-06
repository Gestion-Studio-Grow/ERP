// Rendí: la foto del comprobante de una rendición, de a una. Quién la ve lo decide `comprobanteDeRendicion`.

import { NextResponse } from "next/server";
import { requireApp } from "@/lib/require-app";
import { comprobanteDeRendicion } from "@/lib/proyectos/comprobante.server";

export const dynamic = "force-dynamic";

export async function GET(_pedido: Request, { params }: { params: Promise<{ rendicionId: string }> }) {
  await requireApp("proyectos");
  const { rendicionId } = await params;
  const c = await comprobanteDeRendicion(rendicionId);
  if (!c) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(c.bytes), { headers: { "Content-Type": c.tipo, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
