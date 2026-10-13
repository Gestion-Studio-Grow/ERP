import { getCurrentTenantId } from "@/lib/tenant";
import { fotoGuardada } from "@/lib/inmobiliaria/datos.server";

// Sirve una foto de propiedad que está guardada en la base (subida desde el panel y achicada
// en el navegador). Así la foto nunca viaja dentro del HTML de la página y el navegador la
// guarda: el id de una foto no cambia de contenido, por eso se cachea un año.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let foto: Awaited<ReturnType<typeof fotoGuardada>> = null;
  try {
    foto = await fotoGuardada(await getCurrentTenantId(), id);
  } catch {
    foto = null;
  }
  if (!foto) return new Response("No encontrada", { status: 404 });
  return new Response(new Uint8Array(foto.bytes), {
    headers: {
      "content-type": foto.tipo,
      "content-length": String(foto.bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
