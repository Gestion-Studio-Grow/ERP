/**
 * Validación de CUIT/CUIL con dígito verificador (módulo 11, algoritmo oficial
 * de ARCA/ANSES). Vive en el CORE porque hay dos consumidores que exigen CUIT
 * REAL antes de emitir — validar solo la forma (11 dígitos) deja pasar números
 * inventados: el perfil fiscal del emisor (`@/lib/fiscal`) y la regla de umbral
 * de identificación del plugin BANCOS (que lo reexporta desde su dominio).
 * Nació en `src/plugins/bancos/domain/cuit.ts`; subió al Core cuando el Core lo
 * necesitó, porque la dependencia va plugin→Core y nunca al revés (ADR-002).
 *
 * Nota de alcance: en el resto del repo (suppliers, formal-order) se valida
 * solo FORMA a propósito (datos de terceros que se cargan a mano); acá el dato
 * va derecho a un comprobante fiscal, por eso el verificador es obligatorio.
 * PURO, sin dependencias.
 */

/** Pesos del módulo 11 para los primeros 10 dígitos del CUIT/CUIL. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Qué clase de sujeto indica el prefijo de un CUIT/CUIL. */
export type ClaseDePrefijo = "humana" | "juridica" | "a_confirmar";

/**
 * Prefijos de tipo emitidos por ARCA/ANSES, con la clase de sujeto que indican:
 *   · 20/23/24/25/26/27 → persona humana;
 *   · 30/33/34 → persona jurídica;
 *   · 50/51/55 (UAT 16/10, punto 9) → se aceptan para el dígito verificador (mismo módulo 11),
 *     pero su CLASE es PROVISIONAL A CONFIRMAR: no se pudo sostener con una fuente pública de ARCA
 *     (el sitio de ARCA no fue accesible desde el entorno el 16/10/2026; las fuentes halladas son
 *     de terceros). Hasta confirmarla, nadie decide nada por la clase de estos prefijos
 *     (docs/agent/BACKLOG.md, UAT-CONTADOR-9).
 * Cualquier otro prefijo no es un CUIT real.
 */
const CLASE_POR_PREFIJO: Readonly<Record<string, ClaseDePrefijo>> = {
  "20": "humana",
  "23": "humana",
  "24": "humana",
  "25": "humana",
  "26": "humana",
  "27": "humana",
  "30": "juridica",
  "33": "juridica",
  "34": "juridica",
  "50": "a_confirmar",
  "51": "a_confirmar",
  "55": "a_confirmar",
};
const PREFIJOS_VALIDOS = new Set(Object.keys(CLASE_POR_PREFIJO));

/**
 * La clase de sujeto que indica el prefijo (`null` si el prefijo no es de un CUIT). No valida el
 * dígito verificador: se usa sobre un número que ya pasó `cuitValido`.
 */
export function claseDelPrefijo(v: string | number): ClaseDePrefijo | null {
  return CLASE_POR_PREFIJO[normalizarCuit(v).slice(0, 2)] ?? null;
}

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
