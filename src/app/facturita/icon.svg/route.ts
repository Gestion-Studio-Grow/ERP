// FACTOQUE · /facturita/icon.svg — favicon (grilla de 32, claro y oscuro según el sistema), desde la fuente única
// de la marca (src/lib/factoque-icono.ts). También lo usan el talonario y la página sin conexión.
import { faviconFactoqueSvg } from "@/lib/factoque-icono";

export const dynamic = "force-static";

export function GET() {
  return new Response(faviconFactoqueSvg(), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
