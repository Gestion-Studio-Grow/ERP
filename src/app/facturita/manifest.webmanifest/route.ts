// FACTURITA · Manifiesto de la app instalable (/facturita/manifest.webmanifest).
//
// Estático y sin base (PD-1): Facturita es una marca de producto, igual para todos los que la
// instalan, así que no depende del host ni del negocio (a diferencia del de /admin, que sí es por
// negocio: src/app/api/pwa/admin.webmanifest). Vive bajo /facturita, que el portón del sitio deja
// pasar (SIEMPRE_ABIERTAS en src/lib/site-gate.ts) y que el proxy no trata como superficie con
// sesión: el navegador lo baja sin cookies y le llega el JSON, nunca un redirect al login.

import { manifestFacturita } from "@/lib/facturita-pwa";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(manifestFacturita()), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
