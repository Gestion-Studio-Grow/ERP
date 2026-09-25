// ============================================================================
// PLAN DEL NEGOCIO — lectura del formulario de límites de la consola (R2-F4). Pura, sin servidor.
// ============================================================================
//
// El operador escribe el tope de UN límite para un negocio: vacío = volver al del plan,
// «sin-tope» = sin tope, o un entero entre 0 y TOPE_MAXIMO. Todo lo demás se rechaza con un porqué.

import { TOPE_MAXIMO } from "@/planes/limites";
import type { Tope } from "@/planes/catalogo";

export const VALOR_SIN_TOPE = "sin-tope";

export type ValorDeLimite =
  | { ok: true; quitar: true }
  | { ok: true; quitar: false; tope: Tope }
  | { ok: false; motivo: string };

export function leerValorDeLimite(crudo: string): ValorDeLimite {
  const v = crudo.trim().toLowerCase();
  if (v === "") return { ok: true, quitar: true };
  if (v === VALOR_SIN_TOPE || v === "sin tope") return { ok: true, quitar: false, tope: null };
  if (!/^\d{1,7}$/.test(v)) {
    return { ok: false, motivo: `Escribí un número entero (0 o más), «${VALOR_SIN_TOPE}», o dejalo vacío para volver al tope del plan.` };
  }
  const n = Number(v);
  if (n > TOPE_MAXIMO) return { ok: false, motivo: `El tope más alto que se puede poner es ${TOPE_MAXIMO.toLocaleString("es-AR")}.` };
  return { ok: true, quitar: false, tope: n };
}
