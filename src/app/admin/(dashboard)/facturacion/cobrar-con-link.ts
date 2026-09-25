// El monto del link de cobro: se escribe como se escribe la plata acá («12.500,50»), se lee con la
// regla de la caja (`leerImporte`) y viaja como número canónico («12500.5»), que es lo que
// `generarCobro` lee con `Number()`. PURO: lo prueba cobrar-con-link.test.ts.

import { leerImporte } from "@/lib/pos-peso";

/** El valor a mandar en `monto`, o null si no es un importe mayor a cero. */
export function montoParaElLink(escrito: string): string | null {
  const l = leerImporte(escrito);
  if (l.estado !== "ok" || !(l.valor > 0)) return null;
  return String(l.valor);
}
