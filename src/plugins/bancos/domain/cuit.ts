/**
 * Validación de CUIT/CUIL con dígito verificador (módulo 11, algoritmo oficial
 * de ARCA/ANSES). Vive en el dominio del plugin porque la regla del producto
 * (umbral de identificación) exige CUIL/CUIT REAL antes de emitir — validar
 * solo la forma (11 dígitos) deja pasar números inventados.
 *
 * Nota de alcance: en el resto del repo (suppliers, formal-order) se valida
 * solo FORMA a propósito (datos de terceros que se cargan a mano); acá el dato
 * va derecho a un comprobante fiscal, por eso el verificador es obligatorio.
 * PURO, sin dependencias.
 */

/** Pesos del módulo 11 para los primeros 10 dígitos del CUIT/CUIL. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Prefijos de tipo emitidos por ARCA/ANSES: 20/23/24/25/26/27 (personas),
 * 30/33/34 (personas jurídicas). Cualquier otro prefijo no es un CUIT real.
 */
const PREFIJOS_VALIDOS = new Set(["20", "23", "24", "25", "26", "27", "30", "33", "34"]);

/** Deja solo los dígitos (tolera "20-11111111-2", espacios, puntos). */
export function normalizarCuit(v: string | number): string {
  return String(v).replace(/[^\d]/g, "");
}

/**
 * ¿Es un CUIT/CUIL válido? Chequea: 11 dígitos, prefijo de tipo conocido y
 * dígito verificador (módulo 11). El caso `dv = 10` es inválido por definición
 * (ARCA no emite CUITs cuyo verificador daría 10: cambia el prefijo).
 */
export function cuitValido(v: string | number): boolean {
  const s = normalizarCuit(v);
  if (!/^\d{11}$/.test(s)) return false;
  if (!PREFIJOS_VALIDOS.has(s.slice(0, 2))) return false;

  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(s[i]), 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : 11 - resto;
  if (dv === 10) return false; // combinación que ARCA nunca emite
  return dv === Number(s[10]);
}
