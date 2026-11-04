// GET /api/btf/estado → { configurado, mp }. Sin tablas o sin entorno: configurado:false (nunca 5xx).
import { estaConfigurado } from "@/lib/btf/db";
import { json, manejar } from "@/lib/btf/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return manejar(async () => json(await estaConfigurado()));
}
