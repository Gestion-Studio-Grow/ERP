/**
 * RENDÍ — plata en centavos enteros (Core, PURO). Portado de `origin/frente/rendiciones` sin USD.
 *
 * El redondeo de plata es la regla única de la casa: `@/lib/dinero/redondeo` (ENG-109, ADR-100 §3).
 * Formato (ADR-079): "$1.234,56", sin espacio después del "$", signo adelante ("-$5,00"), aritmética entera.
 */

import { centavosDe, porcentajeDe } from "@/lib/dinero/redondeo";
import type { Centavos } from "./tipos";

/** Alícuotas de IVA argentinas. */
export type Alicuota = 0 | 2.5 | 5 | 10.5 | 21 | 27;

/** Pesos con decimales → centavos. 1234.56 → 123456. EPSILON-safe en el medio centavo (1.005 → 101). */
export function pesos(n: number): Centavos {
  return centavosDe(n);
}

function partes(c: Centavos): { signo: string; miles: string; centavos: string } {
  const entero = Math.round(c);
  const abs = Math.abs(entero);
  const miles = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return { signo: entero < 0 ? "-" : "", miles, centavos: String(abs % 100).padStart(2, "0") };
}

/** Formato de la casa, siempre con centavos: 123456 → "$1.234,56" · -500 → "-$5,00". */
export function formatearPesos(c: Centavos): string {
  const { signo, miles, centavos } = partes(c);
  return `${signo}$${miles},${centavos}`;
}

/** Formato para mensajes: sin ",00" cuando el importe es redondo. 50000000 → "$500.000". */
export function formatearPesosCorto(c: Centavos): string {
  const { signo, miles, centavos } = partes(c);
  return centavos === "00" ? `${signo}$${miles}` : `${signo}$${miles},${centavos}`;
}

/** IVA de una línea: `neto × alicuota / 100`, redondeado una vez al centavo entero (R4: medio centavo lejos del cero). */
export function ivaDeLinea(neto: Centavos, alicuota: Alicuota): Centavos {
  // La base va en centavos: redondear «al peso» de porcentajeDe es redondear al centavo entero.
  return porcentajeDe(neto, alicuota, "peso");
}

export function sumar(...xs: Centavos[]): Centavos {
  return xs.reduce((acc, x) => acc + x, 0);
}
