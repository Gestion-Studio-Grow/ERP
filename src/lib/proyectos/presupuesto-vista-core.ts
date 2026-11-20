/**
 * MIA T06 · vuelta (MIA-131): lo que la ficha y la cotización muestran del presupuesto. PURO, testeable sin base.
 */
import { pesos } from "./core";

/** V3: un solo helper de plata; `pesos` ya recibe la moneda (T12, V3-c). */
export function importe(monto: number, moneda = "ARS"): string {
  return pesos(monto, moneda);
}

/** El costo unitario de un ítem, en su moneda, en la tabla de la ficha sin editar (`_tabla-ficha`). */
export function textoCostoUnitario(costo: number | null | undefined, moneda: string): string {
  return importe(costo ?? 0, moneda);
}

/**
 * «Nueva versión»: con una base aprobada no se ofrece (O10: el cambio va como adicional, y el servidor la rechaza).
 * Tampoco con un borrador abierto, que se sigue editando.
 */
export function ofreceNuevaVersion(v: { baseAprobada: boolean; hayBorrador: boolean }): boolean {
  return !v.baseAprobada && !v.hayBorrador;
}
