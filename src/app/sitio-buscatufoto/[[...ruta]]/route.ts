import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { responderBuscatufoto } from "@/lib/sitio-buscatufoto";

// buscatufoto (producto de GSG) en su propio host. Llega acá por la reescritura de `next.config.ts`; reglas
// y porqué en src/lib/sitio-buscatufoto.ts. Fuera del host de buscatufoto: 404. No toca la base.
export const dynamic = "force-dynamic";

async function existe(rutaRelativa: string): Promise<boolean> {
  try {
    // `turbopackIgnore`: sin él, la ruta armada en tiempo de ejecución mete el proyecto entero en la función.
    // Los archivos del sitio entran explícitos por `outputFileTracingIncludes`.
    return (await stat(path.join(/*turbopackIgnore: true*/ process.cwd(), rutaRelativa))).isFile();
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ruta?: string[] }> },
): Promise<Response> {
  const [{ ruta }, h] = await Promise.all([params, headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return responderBuscatufoto(host, ruta, existe, async (rutaRelativa) =>
    new Uint8Array(await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), rutaRelativa))),
  );
}
