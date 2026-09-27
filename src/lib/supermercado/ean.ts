// ============================================================================
// CÓDIGOS DE BARRAS — EAN-13, EAN-8, UPC-A y GTIN-14, con su dígito verificador.
// ============================================================================
//
// Un supermercado vende por el código de barras: el lector "escribe" los dígitos y manda un
// Enter. Antes de buscar el producto se mira que el código sea un código de verdad: un dígito
// mal leído (el lector que lee medio código, un dedo que agrega un número) da otro producto o
// ninguno, y cobrar otro producto es peor que no encontrar ninguno.
//
// EL DÍGITO VERIFICADOR (GS1, "módulo 10"): de derecha a izquierda, sin contar el verificador,
// los dígitos se multiplican alternando por 3 y por 1; el verificador es lo que le falta a la
// suma para llegar a la decena siguiente. Es la MISMA cuenta para EAN-8, UPC-A (12), EAN-13 y
// GTIN-14: sólo cambia el largo. Se hace con enteros; no hay nada que redondear.
//
// PURO: sin base, sin React. Lo usan la caja (en el navegador, para no mandar al servidor un
// código roto), la acción del servidor (que no confía en el navegador) y el catálogo semilla.

/** Largos de código que se leen como GTIN (con verificador). */
export const LARGOS_GTIN = [8, 12, 13, 14] as const;

/**
 * El dígito verificador GS1 de un cuerpo de dígitos (el código SIN su último dígito).
 * `cuerpo` tiene que ser sólo dígitos; si no, tira (es un error de quien llama, no del lector).
 */
export function digitoVerificador(cuerpo: string): number {
  if (!/^\d+$/.test(cuerpo)) throw new RangeError(`El cuerpo de un código de barras son sólo dígitos: "${cuerpo}".`);
  let suma = 0;
  // El dígito pegado al verificador (el último del cuerpo) pesa 3; el anterior, 1; y así.
  for (let i = cuerpo.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    suma += (cuerpo.charCodeAt(i) - 48) * peso;
  }
  return (10 - (suma % 10)) % 10;
}

/** El código completo: el cuerpo con su verificador pegado al final. */
export function conVerificador(cuerpo: string): string {
  return `${cuerpo}${digitoVerificador(cuerpo)}`;
}

/** ¿Es un GTIN (8, 12, 13 o 14 dígitos) con el verificador bien? */
export function esGtinValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo)) return false;
  if (!(LARGOS_GTIN as readonly number[]).includes(codigo.length)) return false;
  return digitoVerificador(codigo.slice(0, -1)) === codigo.charCodeAt(codigo.length - 1) - 48;
}

/** ¿Es un EAN-13 con el verificador bien? */
export function esEan13Valido(codigo: string): boolean {
  return codigo.length === 13 && esGtinValido(codigo);
}

/**
 * Lo que mandó el lector, limpio: sin espacios ni saltos (algunos lectores agregan un Tab o un
 * CR además del Enter) y sin los guiones con que a veces se tipea a mano. No valida.
 */
export function limpiarCodigoLeido(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/[\s\-]/g, "");
}

/**
 * Un código de producto como se compara contra el catálogo: sin espacios en los bordes. Un
 * UPC-A (12) se lee también como EAN-13 con un 0 adelante: es el mismo producto (GS1). La
 * búsqueda prueba las dos formas (`variantesDeBusqueda`).
 */
export function variantesDeBusqueda(codigo: string): string[] {
  const c = codigo.trim();
  if (!c) return [];
  const v = new Set<string>([c]);
  if (/^\d{12}$/.test(c)) v.add(`0${c}`);
  if (/^0\d{12}$/.test(c)) v.add(c.slice(1));
  // Un código interno numérico corto (el PLU de la balanza: "00123" o "123") vale con o sin
  // ceros a la izquierda. Sólo para los cortos: en un EAN los ceros son parte del código.
  if (/^\d{1,7}$/.test(c)) {
    const sinCeros = c.replace(/^0+(?=\d)/, "");
    v.add(sinCeros);
  }
  return [...v];
}
