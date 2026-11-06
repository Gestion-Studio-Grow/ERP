// FACTOQUE · /facturita/icon.svg — favicon y logo del header, desde la fuente única de la marca.
import { svgFactoque } from "@/lib/factoque-icono";

export const dynamic = "force-static";

export function GET() {
  return new Response(svgFactoque(), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
