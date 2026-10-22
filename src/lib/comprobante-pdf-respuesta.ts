// La respuesta HTTP del PDF de un comprobante, común al backoffice y a Facturita. Las guardias
// (app, permiso) las pone cada ruta; acá sólo se lee con el lector único, que sólo ve comprobantes
// del negocio del pedido, y se arma el PDF o se dice qué falta, en castellano.
import { leerComprobanteImpreso } from "@/lib/comprobante-pdf-datos";
import { generarComprobantePdf } from "@/lib/comprobante-pdf";

function aviso(estado: number, texto: string): Response {
  return new Response(texto, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export async function respuestaPdfDeComprobante(id: string, tenantId: string, volverA: string): Promise<Response> {
  const datos = await leerComprobanteImpreso(id, tenantId);
  if (!datos) return aviso(404, `No encontramos ese comprobante en tu negocio. Volvé a ${volverA} y elegilo de la lista.`);

  const r = await generarComprobantePdf(datos);
  if (!r.ok) {
    return aviso(409, ["Todavía no se puede descargar este comprobante. Falta:", ...r.faltantes.map((f) => `- ${f.mensaje}`)].join("\n"));
  }
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.nombreArchivo}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
