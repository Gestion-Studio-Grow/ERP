// Alta web de Factoque — lo que comparten el formulario (cliente) y el servidor. PURO y sin
// `node:*`: lo importa AltaAsistente.tsx. El resto del núcleo: alta-web-core.ts.

import { isValidEmail } from "@/lib/provisioning/slug";

/** Nombre del campo trampa: invisible para una persona, tentador para un robot. */
export const CAMPO_TRAMPA = "sitio_web";

/** La respuesta después de pedir el alta. SIEMPRE la misma: no dice si el mail o el CUIT ya existen. */
export const RESPUESTA_DEL_PEDIDO =
  "Si los datos están bien, en unos minutos te llega un mail con un enlace para confirmar. Vence en 24 horas. Si no lo ves, mirá en spam o promociones.";

export function validarEmail(crudo: string): string | null {
  const email = (crudo ?? "").trim().toLowerCase();
  if (!email) return "Escribí tu mail: ahí te mandamos el enlace para confirmar.";
  if (email.length > 254 || !isValidEmail(email)) return "Ese mail no parece válido: revisá que tenga @ y un dominio (ej. nombre@gmail.com).";
  return null;
}

/** ¿El robot completó el campo trampa? */
export const cayoEnLaTrampa = (valor: string | null | undefined): boolean => (valor ?? "").trim().length > 0;
