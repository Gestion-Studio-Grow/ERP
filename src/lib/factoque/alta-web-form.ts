// Alta web de Factoque — lo que comparten el formulario (cliente) y el servidor. PURO y sin
// `node:*`: lo importa AltaAsistente.tsx. El resto del núcleo: alta-web-core.ts.

import { isValidEmail } from "@/lib/provisioning/slug";

/** Nombre del campo trampa: invisible para una persona, tentador para un robot. */
export const CAMPO_TRAMPA = "sitio_web";

/** La respuesta después de pedir el alta. SIEMPRE la misma: no dice si el mail o el CUIT ya existen. */
export const RESPUESTA_DEL_PEDIDO =
  "Si los datos están bien, en unos minutos te llega un mail con un enlace para confirmar. Vence en 24 horas. Si no lo ves, mirá en spam o promociones.";

/**
 * La respuesta cuando el servidor NO tiene el mail conectado (sin RESEND_API_KEY / RESEND_FROM_EMAIL): el
 * enlace no saldría, así que no se promete un mail. Es un estado del servidor, igual para cualquier pedido:
 * no revela si el mail o el CUIT existen. Prod 11/11: decía «revisá tu mail» y el mail nunca salía.
 */
export const RESPUESTA_SIN_MAIL_WHATSAPP =
  "Recibimos tus datos. Por ahora la activación es por WhatsApp: escribinos y te activamos hoy.";

/** Sin número de WhatsApp cargado (WHATSAPP_GSG), el canal es la casilla de GSG; nunca un número inventado. */
export const respuestaSinMailPorCasilla = (casilla: string): string =>
  `Recibimos tus datos. Por ahora la activación es por mail: escribinos a ${casilla} y te activamos hoy.`;

/** El texto ya cargado en el WhatsApp (o el mail) de activación. Sin mail, sin CUIT, sin ningún dato del pedido. */
export const MENSAJE_ACTIVAR_FACTOQUE = "Hola, quiero activar Factoque.";

export function validarEmail(crudo: string): string | null {
  const email = (crudo ?? "").trim().toLowerCase();
  if (!email) return "Escribí tu mail: ahí te mandamos el enlace para confirmar.";
  if (email.length > 254 || !isValidEmail(email)) return "Ese mail no parece válido: revisá que tenga @ y un dominio (ej. nombre@gmail.com).";
  return null;
}

/** ¿El robot completó el campo trampa? */
export const cayoEnLaTrampa = (valor: string | null | undefined): boolean => (valor ?? "").trim().length > 0;
