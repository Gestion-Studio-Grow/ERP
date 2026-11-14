import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { responderClubCrudo } from "@/lib/club-crudo";
import { esUsuarioDelClubCrudo } from "@/lib/club-crudo.server";

// El club crudo de Break Point (public/previews/breakpoint/club). Llega acá por la reescritura del proxy; las reglas
// y el porqué viven en src/lib/club-crudo.ts. Sólo un usuario activo de breakpoint con el permiso del club; si no, 404.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ archivo?: string[] }> },
): Promise<Response> {
  const { archivo } = await params;
  return responderClubCrudo(
    archivo,
    // `turbopackIgnore`: ver src/app/sitio-estatico. Los archivos entran por `outputFileTracingIncludes`.
    async (rutaRelativa) => new Uint8Array(await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), rutaRelativa))),
    async () => esUsuarioDelClubCrudo(await readSessionToken((await cookies()).get(getSessionCookieName())?.value)),
  );
}
