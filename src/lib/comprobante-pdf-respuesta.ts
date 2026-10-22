// La respuesta HTTP del PDF de un comprobante, común al backoffice y a Facturita. Las guardias
// (app, permiso) las pone cada ruta; acá sólo se lee con el lector único, que sólo ve comprobantes
// del negocio del pedido, y se arma el PDF o se dice qué falta, en castellano.
//
// `volverA` es el nombre de la pantalla de origen (texto), o un objeto con lo que el aviso necesita
// para no ser un callejón sin salida en un producto que no tiene las pantallas del backoffice
// (Facturita): adónde volver, adónde se completan los datos del emisor, y cómo decir cada faltante.
// Con el objeto, el 409 es una página HTML con enlaces; con el texto, el aviso de siempre.
import { leerComprobanteImpreso } from "@/lib/comprobante-pdf-datos";
import { generarComprobantePdf, type Faltante } from "@/lib/comprobante-pdf";

export interface VolverA {
  /** Nombre de la pantalla de origen («Mis facturas»). */
  texto: string;
  /** Ruta de la pantalla de origen. */
  href: string;
  /** Dónde se completan los datos del emisor (razón social, domicilio…), si el producto lo tiene. */
  completarEmisor?: { texto: string; href: string };
  /** Cómo decir un faltante en este producto (por defecto, el mensaje del generador). */
  reescribir?: (f: Faltante) => string;
}

function aviso(estado: number, texto: string): Response {
  return new Response(texto, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Una página mínima, autónoma y accesible, con lo que falta y los enlaces para resolverlo. */
function avisoHtml(estado: number, titulo: string, items: string[], enlaces: { texto: string; href: string }[]): Response {
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapar(titulo)}</title>
<style>body{margin:0;padding:1.5rem 1rem;font:16px/1.5 system-ui,-apple-system,sans-serif;background:Canvas;color:CanvasText}main{max-width:36rem;margin:0 auto}h1{font-size:1.375rem;line-height:1.25}li{margin:.5rem 0}a{display:inline-block;margin:.5rem 1rem 0 0;padding:.625rem 1rem;border:1px solid currentColor;border-radius:.625rem;font-weight:600;color:LinkText;text-decoration:none}a:focus-visible{outline:2px solid LinkText;outline-offset:3px}</style></head>
<body><main><h1>${escapar(titulo)}</h1><ul>${items.map((i) => `<li>${escapar(i)}</li>`).join("")}</ul><p>${enlaces
    .map((e) => `<a href="${escapar(e.href)}">${escapar(e.texto)}</a>`)
    .join("")}</p></main></body></html>`;
  return new Response(html, {
    status: estado,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function respuestaPdfDeComprobante(id: string, tenantId: string, volverA: string | VolverA): Promise<Response> {
  const destino = typeof volverA === "string" ? null : volverA;
  const nombreOrigen = typeof volverA === "string" ? volverA : volverA.texto;

  const datos = await leerComprobanteImpreso(id, tenantId);
  if (!datos) {
    const texto = `No encontramos ese comprobante en tu negocio. Volvé a ${nombreOrigen} y elegilo de la lista.`;
    return destino ? avisoHtml(404, "No encontramos esa factura", [texto], [{ texto: `Volver a ${destino.texto}`, href: destino.href }]) : aviso(404, texto);
  }

  const r = await generarComprobantePdf(datos);
  if (!r.ok) {
    if (!destino) {
      return aviso(409, ["Todavía no se puede descargar este comprobante. Falta:", ...r.faltantes.map((f) => `- ${f.mensaje}`)].join("\n"));
    }
    const faltaEmisor = r.faltantes.some((f) => f.campo.startsWith("emisor."));
    const enlaces = [
      ...(faltaEmisor && destino.completarEmisor ? [destino.completarEmisor] : []),
      { texto: `Volver a ${destino.texto}`, href: destino.href },
    ];
    const items = [...new Set(r.faltantes.map((f) => (destino.reescribir ? destino.reescribir(f) : f.mensaje)))];
    return avisoHtml(409, "Todavía no se puede descargar esta factura", items, enlaces);
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
