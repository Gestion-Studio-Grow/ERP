// Cuando el paquete del mes no se puede bajar (un mes en curso, un cliente que no es de la
// cartera), el link abre una PANTALLA con el motivo y una forma de volver, no un texto plano
// (hallazgo QA 26/09). PURA: arma el HTML. El texto se escapa; el link de vuelta es fijo (no
// depende del cliente pedido, así la respuesta es la misma exista o no ese negocio).

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function paginaDeAviso(x: { titulo: string; mensaje: string; volverA: string; volverTexto: string }): string {
  return [
    "<!doctype html>",
    '<html lang="es-AR">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${escapar(x.titulo)}</title>`,
    "<style>",
    "body{font-family:Arial,sans-serif;margin:0;padding:24px 16px;color:#1d1d1f;background:#f5f5f7}",
    "main{max-width:36rem;margin:0 auto}",
    "h1{font-size:1.25rem;margin:0 0 12px}",
    "p{font-size:1rem;line-height:1.5;margin:0 0 20px}",
    "a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid #1d1d1f;border-radius:6px;color:#1d1d1f;text-decoration:none;font-weight:600}",
    "</style>",
    "</head>",
    "<body><main>",
    `<h1>${escapar(x.titulo)}</h1>`,
    `<p>${escapar(x.mensaje)}</p>`,
    `<a href="${escapar(x.volverA)}">${escapar(x.volverTexto)}</a>`,
    "</main></body>",
    "</html>",
  ].join("\n");
}

/** La pantalla del paquete que no se pudo bajar: siempre vuelve a la cartera. */
export function avisoDelPaquete(mensaje: string): string {
  return paginaDeAviso({ titulo: "No se pudo bajar el paquete del mes", mensaje, volverA: "/contador", volverTexto: "Volver a la cartera" });
}
