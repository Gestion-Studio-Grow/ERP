// ============================================================================
// TECLADO NUMÉRICO — la tecla de peso y la de plata. Puro: sin React.
// ============================================================================
//
// La carnicera tiene la etiqueta de la balanza en la mano: «1,280». No tiene por qué buscar la
// coma en un teclado chico con guantes. Acá se tipean SÓLO los dígitos y la coma la pone el
// sistema, como en un visor de balanza o un posnet: los dígitos entran por la derecha.
//
//   peso  (3 decimales, gramos):  1 → 0,001 · 12 → 0,012 · 128 → 0,128 · 1280 → 1,280 kg
//   plata (sin centavos):         7 → $7 · 70 → $70 · 7000 → $7.000 (y «00» agrega dos ceros)
//
// El estado es el texto de los dígitos tipeados (sin ceros a la izquierda). Lo prueba
// teclado-core.test.ts ejecutando cada tecla.

export type ModoTeclado = "peso" | "plata";

export type Tecla = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "borrar" | "limpiar";

/** Máximo de dígitos por modo: 99,999 kg en el mostrador; $999.999.999 en un cobro. */
export const MAX_DIGITOS: Record<ModoTeclado, number> = { peso: 5, plata: 9 };

const DECIMALES: Record<ModoTeclado, number> = { peso: 3, plata: 0 };

/** Aplica una tecla. Lo que no entra (pasarse del máximo) se ignora: el visor no cambia. */
export function aplicarTecla(digitos: string, tecla: Tecla, modo: ModoTeclado): string {
  if (tecla === "limpiar") return "";
  if (tecla === "borrar") return digitos.slice(0, -1);
  const nuevo = (digitos + tecla).replace(/^0+/, "");
  if (nuevo.length > MAX_DIGITOS[modo]) return digitos;
  return nuevo;
}

/** El valor numérico de lo tipeado (kg o pesos). */
export function valorDe(digitos: string, modo: ModoTeclado): number {
  if (digitos === "") return 0;
  return Number(digitos) / 10 ** DECIMALES[modo];
}

export interface Visor {
  /** Lo que todavía es relleno (los ceros y la coma que pone el sistema): se muestra apagado. */
  relleno: string;
  /** Lo tipeado: se muestra fuerte. */
  cargado: string;
  unidad: string;
  /** Todo en una línea, para el lector y los tests («1,280 kg», «$7.000»). */
  texto: string;
}

function agrupar(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Cómo se ve el visor. En peso, siempre «0,000» de base y los dígitos llenan desde la derecha: lo
 * que no se tipeó queda en `relleno` (apagado), así se ve cuántos gramos faltan. En plata, «$0».
 */
export function visorDe(digitos: string, modo: ModoTeclado): Visor {
  if (modo === "plata") {
    const cargado = digitos === "" ? "" : agrupar(digitos);
    return { relleno: digitos === "" ? "$0" : "$", cargado, unidad: "", texto: `$${cargado || "0"}` };
  }
  const dec = DECIMALES.peso;
  const lleno = digitos.padStart(dec + 1, "0");
  // Con 5 dígitos como máximo (99,999 kg) la parte entera nunca llega a los miles: sin puntos.
  const completo = `${lleno.slice(0, -dec)},${lleno.slice(-dec)}`;
  // Cuántos caracteres del final son tipeados (la coma cuenta si lo tipeado la cruza).
  const tipeados = digitos.length + (digitos.length > dec ? 1 : 0);
  const corte = Math.max(0, completo.length - tipeados);
  return { relleno: completo.slice(0, corte), cargado: completo.slice(corte), unidad: "kg", texto: `${completo} kg` };
}

/** Tecla física → tecla del teclado (para usarlo con el teclado de la PC). */
export function teclaDesdeTeclado(key: string): Tecla | null {
  if (/^[0-9]$/.test(key)) return key as Tecla;
  if (key === "Backspace") return "borrar";
  if (key === "Delete" || key === "Escape") return "limpiar";
  return null;
}
