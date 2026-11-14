// PROFETURNOS · Prueba gratis y abono mensual: UNA sola fuente para la vidriera, los términos y el
// cobro (tanda T2). Valores PROVISIONALES A CONFIRMAR por el dueño (PLAN-SALIDA-2026-11 §6, decisiones
// 1 y 2): cuando los confirme se cambian acá y no en cada página. PURO: sin imports.

/** Días de prueba gratis desde el alta. Provisional a confirmar. */
export const DIAS_PRUEBA = 14;

/** Precio del abono mensual, en pesos argentinos, final. Provisional a confirmar. */
export const PRECIO_MENSUAL = 12900;

/** true mientras el dueño no confirme los números de arriba: la vidriera lo dice al lado del precio. */
export const PRECIO_PROVISIONAL = true;

/** Días corridos para arrepentirse de la contratación a distancia (art. 34 Ley 24.240; art. 1110 CCyC). */
export const DIAS_ARREPENTIMIENTO = 10;

/** «$ 12.900» (separador de miles argentino, sin decimales). */
export function precioEnPesos(n: number = PRECIO_MENSUAL): string {
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}

/** Alias usado por los textos legales. */
export const precioMensualEnTexto = precioEnPesos;
