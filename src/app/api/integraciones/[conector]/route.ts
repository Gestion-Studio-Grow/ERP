// GET|POST /api/integraciones/{conector} — avisos de los conectores con UNA URL para toda la
// aplicación (WhatsApp). GET = desafío de verificación; POST = firma con el secreto de la
// aplicación y cada evento a la conexión de su cuenta externa. Lógica: src/integraciones/entrada.server.ts.

import { atenderAvisoDeApp, atenderDesafio, depsDeProduccion } from "@/integraciones/entrada.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ conector: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { conector } = await params;
  return atenderDesafio(request, conector, depsDeProduccion());
}

export async function POST(request: Request, { params }: Ctx) {
  const { conector } = await params;
  return atenderAvisoDeApp(request, conector, depsDeProduccion());
}
