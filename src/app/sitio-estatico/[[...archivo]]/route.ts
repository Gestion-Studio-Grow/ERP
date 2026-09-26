import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { responderSitioEstatico } from "@/lib/sitio-estatico";

// Sitio estático del negocio del host (hoy, Circuito WPE en wpe.gsgapp.com.ar). Llega acá por las
// reescrituras de `next.config.ts`; las reglas y el porqué viven en src/lib/sitio-estatico.ts.
// El negocio sale del host por la vía de siempre; sin negocio, o si no es el dueño del sitio, 404.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ archivo?: string[] }> },
): Promise<Response> {
  const { archivo } = await params;
  // `turbopackIgnore`: sin él, la ruta armada en tiempo de ejecución hace que el build meta el proyecto
  // entero en esta función. Los archivos del sitio entran explícitos por `outputFileTracingIncludes`.
  return responderSitioEstatico(await getCurrentTenantSlug(), archivo, async (rutaRelativa) =>
    new Uint8Array(await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), rutaRelativa))),
  );
}
