// POST /api/integraciones/c/{token} — avisos de los conectores con URL por conexión (Mercado
// Pago). token → conexión → negocio, firma con el secreto de ESA conexión, EventoIntegracion
// deduplicado y handler en el contexto del negocio. Toda la lógica: src/integraciones/entrada.server.ts.
// Token desconocido → 404 vacío.

import { atenderAvisoPorConexion, depsDeProduccion } from "@/integraciones/entrada.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return atenderAvisoPorConexion(request, token, depsDeProduccion());
}
