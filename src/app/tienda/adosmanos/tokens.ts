// ============================================================================
// A DOS MANOS PÁDEL — lo que es de la MARCA y lo que es una PROMESA COMERCIAL, en constantes.
// ============================================================================
//
// La marca real todavía no existe (no hay logo, ni colores, ni letras del dueño: DISENO.md §3 y §13).
// Todo lo de identidad de esta vidriera es PROVISIONAL A CONFIRMAR POR EL DUEÑO y se dice así en el
// pie mientras `MARCA_PROVISIONAL` esté en true. Cuando llegue lo real, se cambian estos tokens y el
// logotipo (Siluetas.tsx → Logotipo) sin tocar la estructura.
//
// Las promesas comerciales (descuento, cuotas, envío, cambios) salen del copy del negocio
// (src/tenants/storefront.ts, armado con el MODELO de negocio, no con material del dueño). Cada una se
// puede apagar acá sin tocar JSX.

import { redondearAlPeso } from "@/lib/dinero/redondeo";

/** Identidad (logotipo, paleta, letras) provisional: el pie lo dice. [A VALIDAR dueño] */
export const MARCA_PROVISIONAL = true;

/**
 * El descuento por transferencia del copy («28% off»). [A VALIDAR dueño]
 * El PRECIO calculado con él (lista × 0,72) es un dato que el dueño NO cargó: no se muestra mientras
 * `MOSTRAR_PRECIO_TRANSFERENCIA` siga en false (decisión del orquestador, 29/10). Con false no hay chip
 * «$X por transferencia» en tarjetas ni ficha, ni «total por transferencia» en la bolsa.
 */
export const DESCUENTO_TRANSFERENCIA: number | null = 0.28;
export const MOSTRAR_PRECIO_TRANSFERENCIA = false;

/**
 * Las promesas del copy, una por una. [A VALIDAR dueño] — apagar = desaparecen de la página.
 * Apagadas el 29/10 (certificación F4) las que el dueño nunca confirmó: descuento, cuotas y cambios. Se prenden
 * cuando él las confirme por escrito.
 */
export const PROMESAS = {
  /** «28% off por transferencia» como texto (no el precio calculado). */
  transferencia: false,
  /** «3 y 12 cuotas sin interés». */
  cuotas: false,
  /** «Envíos a todo el país». */
  envios: true,
  /** «Cambios dentro de los 30 días». */
  cambios: false,
} as const;

/** El precio por transferencia, redondeado a $100, o null si no corresponde mostrarlo. */
export function precioTransferencia(lista: number, mostrar = MOSTRAR_PRECIO_TRANSFERENCIA, descuento = DESCUENTO_TRANSFERENCIA): number | null {
  if (!mostrar || descuento === null || !(lista > 0)) return null;
  return redondearAlPeso((lista * (1 - descuento)) / 100) * 100;
}

/** Paleta provisional (cancha azul, líneas de cal, pelota). Los usa la piel (estilos.ts). */
export const COLORES = {
  cal: "#f3f2ec",
  carbon: "#111418",
  cancha: "#1b48d2",
  cancha2: "#0f2f96",
  pelota: "#d9f03a",
  gris: "#5f6872",
  linea: "#d6d9d2",
} as const;

/** Talles de zapatilla que se ofrecen para elegir (el talle real lo confirma el local). [A VALIDAR dueño] */
export const TALLES = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"] as const;
