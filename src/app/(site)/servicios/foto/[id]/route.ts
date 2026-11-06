import { getCurrentTenantId } from "@/lib/tenant";
import { fotoDeServicioGuardada } from "@/lib/servicios/ficha.server";

// Sirve una foto de servicio guardada en la base (subida desde el catálogo y achicada en el
// navegador). Así la foto nunca viaja dentro del HTML de la página y el navegador la guarda: el id
// de una foto no cambia de contenido, por eso se cachea un año. Sólo la del negocio del pedido
// (`tenantId` en el where, además de RLS): el id de una foto de otro negocio da 404.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let foto: Awaited<ReturnType<typeof fotoDeServicioGuardada>> = null;
  try {
    foto = await fotoDeServicioGuardada(await getCurrentTenantId(), id);
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
