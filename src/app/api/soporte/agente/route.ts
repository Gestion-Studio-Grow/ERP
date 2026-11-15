import { NextResponse } from "next/server";
import { atenderAgente } from "@/lib/soporte/agente-api.server";

// La API que llama la sesión de Claude disparada por el despacho (MANT-004, diseño §15.5): GET lee el
// ticket del despacho, POST deja el borrador. Toda la lógica (credencial por nivel, despacho abierto,
// negocio resuelto por el servidor, límites, AuditLog, apagado) vive en agente-api.server.ts.

export const dynamic = "force-dynamic";

async function responder(request: Request) {
  const r = await atenderAgente(request);
  return NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store", ...r.headers } });
}

export async function GET(request: Request) {
  return responder(request);
}

export async function POST(request: Request) {
  return responder(request);
}
