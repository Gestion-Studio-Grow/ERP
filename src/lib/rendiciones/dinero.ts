/**
 * RENDÍ — plata en centavos enteros (Core, PURO).
 *
 * Todo el dominio de rendiciones trabaja en `Centavos` (enteros). El redondeo de plata es la regla
 * única de la casa: `round2` de `@/lib/round` (EPSILON-safe, "medio hacia arriba", ADR-057).
 *
 * Formato (ADR-079): el mismo que `fmtMoneyARS` de `src/components/ui/format.ts` — "$1.234,56", sin
 * espacio después del "$", signo adelante ("-$5,00"), siempre dos decimales. El Core no importa
 * `components/ui`: acá se replica con aritmética entera (sin `Intl`, así da idéntico en node y en el
 * navegador) y un test compara los dos.
 */

import { round2 } from "@/lib/round";
import type { Alicuota, Centavos, Moneda } from "./tipos";

/** Pesos con decimales → centavos. 1234.56 → 123456. EPSILON-safe en el medio centavo (1.005 → 101). */
export function pesos(n: number): Centavos {
  return Math.round(round2(n) * 100);
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

/**
 * Formato para mensajes: sin ",00" cuando el importe es redondo. 50000000 → "$500.000";
 * 123456 → "$1.234,56". Es el que usan los mensajes del motor ("Faltan justificar $12.700.").
 */
export function formatearPesosCorto(c: Centavos): string {
  const { signo, miles, centavos } = partes(c);
  return centavos === "00" ? `${signo}$${miles}` : `${signo}$${miles},${centavos}`;
}

/** IVA de una línea: `Math.round(neto * alicuota / 100)`. Es la regla del contrato, sin variantes. */
export function ivaDeLinea(neto: Centavos, alicuota: Alicuota): Centavos {
  return Math.round((neto * alicuota) / 100);
}

export function sumar(...xs: Centavos[]): Centavos {
  return xs.reduce((acc, x) => acc + x, 0);
}

/**
 * Lleva un importe a pesos. En ARS no cambia; en USD multiplica por la cotización y redondea a
 * centavos con `round2`. Sin cotización usa 1 (el motor ya bloquea ese caso con V14_MONEDA_SIN_COTIZACION).
 */
export function convertirAPesos(c: Centavos, moneda: Moneda, cotizacion?: number): Centavos {
  if (moneda === "ARS") return c;
  const factor = cotizacion !== undefined && cotizacion > 0 ? cotizacion : 1;
  return pesos((c / 100) * factor);
}
