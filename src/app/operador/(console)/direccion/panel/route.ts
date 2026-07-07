import { PANEL_HTML } from "../panel.generated";

// Sirve el panel de la Célula (producto ejecutivo) como HTML autocontenido, DETRÁS del
// portón del control-plane (/operador → proxy.ts, ADR-021). No vive en public/ a propósito:
// ahí sería accesible sin login. Es contenido estratégico interno, no dato de tenant.
export async function GET() {
  return new Response(PANEL_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "SAMEORIGIN",
    },
  });
}
