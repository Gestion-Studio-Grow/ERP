// Lo que el sitio de CH promete sobre CÓMO confirma el turno, según lo que el negocio cargó en Localización.
//
// La QA (29/10) vio la home, la confirmación y el pie diciendo «te confirmamos por WhatsApp» con el WhatsApp
// vacío, y el botón «Confirmar por WhatsApp» abriendo un aviso que manda a «otros medios más abajo» que no
// existen. Regla: sin WhatsApp cargado, ningún texto promete WhatsApp; el turno se confirma igual (el negocio
// tiene el teléfono de la clienta), así que se dice eso. Sólo con el «Diseño nuevo» de CH prendido: apagado,
// el sitio de siempre no cambia (diseno-nuevo.test.ts). PURO.

/** La línea de cómo se confirma el turno. */
export function comoConfirmamos(whatsapp: string | null | undefined): string {
  return whatsapp ? "Te confirmamos por WhatsApp con el turno tomado." : "Te confirmamos el turno por mensaje o llamado.";
}

/** La nota de contacto del pie sin los tramos que hablan de WhatsApp, si el negocio no tiene WhatsApp. */
export function notaDeContactoSinPromesa(nota: string, whatsapp: string | null | undefined): string {
  if (whatsapp || !/whatsapp/i.test(nota)) return nota;
  const tramos = nota
    .split("·")
    .map((t) => t.trim())
    .filter((t) => t && !/whatsapp/i.test(t));
  return tramos.length > 0 ? tramos.join(" · ") : "Reservas por la web";
}

/** Una frase con «por WhatsApp» (la bajada de /reserva, la seña): sin WhatsApp, sin esa promesa. */
export function sinPromesaDeWhatsApp(texto: string, whatsapp: string | null | undefined): string {
  if (whatsapp) return texto;
  return texto
    .replace(/Te confirmamos por WhatsApp\./g, "Te confirmamos el turno por mensaje o llamado.")
    .replace(/\s*por WhatsApp/gi, "");
}
