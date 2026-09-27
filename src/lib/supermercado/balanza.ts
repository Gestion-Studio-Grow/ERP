// ============================================================================
// CÓDIGO DE BALANZA — la etiqueta que imprime la balanza del fiambre, la carne o la verdura.
// ============================================================================
//
// QUÉ ES. La balanza de la sección (Systel, Kretz, Moretti y las demás que se usan acá) pesa,
// calcula e imprime una etiqueta con un EAN-13 "de uso interno": empieza con 20 a 29 (el
// rango que GS1 reserva para eso) y adentro lleva el código del producto en la balanza (PLU) y
// el PESO o el IMPORTE. La caja lee esa etiqueta como cualquier otro código.
//
// EL FORMATO LO ELIGE CADA NEGOCIO, porque lo configura el técnico de la balanza, no nosotros:
//
//     2 dígitos de prefijo │ N dígitos del producto │ 10−N dígitos de valor │ verificador
//     "20"                 │ "01234" (N = 5)        │ "01250" (1,250 kg)    │ "x"
//
//   · `digitosProducto`: 4, 5 o 6. Lo que queda (6, 5 o 4) es el valor.
//   · `contenido`: "peso" o "importe".
//   · `decimales`: cuántos de los dígitos del valor van después de la coma. Peso: 3 (gramos) o
//     2 (decenas de gramos). Importe: 0 (pesos enteros, lo común en 2026), 1 o 2 (centavos).
//   · `prefijos`: cuáles de 20…29 usa esa balanza. Un código con otro prefijo 2x NO se toma
//     como etiqueta de balanza: puede ser un código interno de otra cosa.
//
// LO QUE SE COBRA:
//   · Etiqueta con PESO: el peso de la etiqueta por el precio por kilo del sistema. Si la
//     balanza tiene otro precio cargado, cobra el del sistema (el que está en la góndola).
//   · Etiqueta con IMPORTE: se cobra EXACTO lo que dice la etiqueta, que es lo que vio el
//     cliente. El peso para el stock se deduce: importe ÷ precio por kilo, al gramo.
//
// No hay verificador del precio dentro del código (algunos formatos viejos lo traen): no se
// soporta y el alta de la configuración no lo ofrece. PROVISIONAL A CONFIRMAR con la balanza
// real del primer supermercado.
//
// PURO: sin base, sin React. Lo usan la caja (navegador), la acción del servidor y los tests.

import { conVerificador, esEan13Valido } from "./ean";
import { redondearCantidad } from "@/lib/pos-peso";
import { centavosDe, redondearAlCentavo } from "@/lib/dinero/redondeo";

export type ContenidoDeBalanza = "peso" | "importe";

export interface FormatoBalanza {
  /** Prefijos de dos dígitos, de "20" a "29", que imprime la balanza. */
  prefijos: string[];
  /** Dígitos del código del producto (PLU) después del prefijo. */
  digitosProducto: 4 | 5 | 6;
  contenido: ContenidoDeBalanza;
  /** Dígitos del valor que van después de la coma. */
  decimales: number;
}

/** El formato más común en las balanzas de acá: 20 + PLU de 5 + peso en gramos (5) + verificador. */
export const FORMATO_BALANZA_POR_DEFECTO: FormatoBalanza = {
  prefijos: ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"],
  digitosProducto: 5,
  contenido: "peso",
  decimales: 3,
};

const PREFIJOS_VALIDOS = new Set(["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]);

/** Cuántos dígitos del código son el valor (peso o importe). */
export function digitosDeValor(f: Pick<FormatoBalanza, "digitosProducto">): number {
  return 10 - f.digitosProducto;
}

/**
 * ¿La configuración tiene sentido? Devuelve el problema en castellano, o null. La usa la
 * pantalla antes de guardar y el servidor antes de escribir: lo que llega del navegador no se
 * asume.
 */
export function problemaDelFormato(f: unknown): string | null {
  if (!f || typeof f !== "object") return "Falta la configuración de la balanza.";
  const o = f as Record<string, unknown>;
  if (!Array.isArray(o.prefijos) || o.prefijos.length === 0) return "Elegí al menos un prefijo (del 20 al 29).";
  if (!o.prefijos.every((p) => typeof p === "string" && PREFIJOS_VALIDOS.has(p))) {
    return "Los prefijos de la balanza van del 20 al 29.";
  }
  if (o.digitosProducto !== 4 && o.digitosProducto !== 5 && o.digitosProducto !== 6) {
    return "El código del producto en la balanza tiene 4, 5 o 6 dígitos.";
  }
  if (o.contenido !== "peso" && o.contenido !== "importe") return "Elegí si la etiqueta trae el peso o el importe.";
  if (typeof o.decimales !== "number" || !Number.isInteger(o.decimales)) return "Los decimales son un número entero.";
  const valor = digitosDeValor({ digitosProducto: o.digitosProducto });
  if (o.contenido === "peso" && o.decimales !== 2 && o.decimales !== 3) {
    return "El peso va en gramos (3 decimales) o en decenas de gramos (2 decimales).";
  }
  if (o.contenido === "importe" && (o.decimales < 0 || o.decimales > 2)) {
    return "El importe va en pesos (0 decimales), con décimos (1) o con centavos (2).";
  }
  if (o.decimales >= valor) return "Con esa cantidad de decimales no queda lugar para la parte entera del valor.";
  return null;
}

/** Normaliza lo que llega de afuera a un formato válido, o null. */
export function formatoDesdeAfuera(f: unknown): FormatoBalanza | null {
  if (problemaDelFormato(f)) return null;
  const o = f as FormatoBalanza;
  return {
    prefijos: [...new Set(o.prefijos)].sort(),
    digitosProducto: o.digitosProducto,
    contenido: o.contenido,
    decimales: o.decimales,
  };
}

/** ¿Este código tiene la forma de una etiqueta de ESTA balanza? (13 dígitos y un prefijo suyo). */
export function esCodigoDeBalanza(codigo: string, f: FormatoBalanza): boolean {
  return /^\d{13}$/.test(codigo) && f.prefijos.includes(codigo.slice(0, 2));
}

export type LecturaBalanza =
  | { ok: true; plu: string; contenido: "peso"; peso: number }
  | { ok: true; plu: string; contenido: "importe"; importe: number }
  | { ok: false; mensaje: string };

export const MENSAJE_VERIFICADOR_BALANZA =
  "La etiqueta de la balanza se leyó mal (el último dígito no cierra). Pasala de nuevo por el lector o tipeá el código.";

/**
 * Lee una etiqueta de balanza. Supone que `esCodigoDeBalanza` ya dio true; igual lo vuelve a
 * mirar. El verificador del EAN-13 se controla SIEMPRE: una etiqueta arrugada que el lector
 * lee con un dígito cambiado cobraría otro peso.
 */
export function leerEtiquetaDeBalanza(codigo: string, f: FormatoBalanza): LecturaBalanza {
  if (!esCodigoDeBalanza(codigo, f)) return { ok: false, mensaje: "Ese código no es una etiqueta de la balanza." };
  if (!esEan13Valido(codigo)) return { ok: false, mensaje: MENSAJE_VERIFICADOR_BALANZA };
  const plu = codigo.slice(2, 2 + f.digitosProducto);
  const valorTxt = codigo.slice(2 + f.digitosProducto, 12);
  const entero = Number(valorTxt);
  if (!(entero > 0)) {
    return { ok: false, mensaje: f.contenido === "peso" ? "La etiqueta dice peso 0: volvé a pesar." : "La etiqueta dice $0: volvé a pesar." };
  }
  if (f.contenido === "peso") {
    return { ok: true, plu, contenido: "peso", peso: redondearCantidad(entero / 10 ** f.decimales) };
  }
  return { ok: true, plu, contenido: "importe", importe: redondearAlCentavo(entero / 10 ** f.decimales) };
}

/** Lo que va al ticket por una etiqueta de balanza, ya con el producto del sistema. */
export type RenglonDeBalanza =
  | { ok: true; cantidad: number; importe: number | null }
  | { ok: false; mensaje: string };

/**
 * La cantidad (kg) y, si la etiqueta traía importe, el importe a cobrar. `producto` es el del
 * catálogo que corresponde al PLU. PURA.
 *
 *   · peso    → cantidad = el peso; importe = null (lo calcula la venta con el precio por kilo).
 *   · importe → importe = el de la etiqueta; cantidad = importe ÷ precio por kilo, al gramo.
 */
export function renglonDeBalanza(
  lectura: Extract<LecturaBalanza, { ok: true }>,
  producto: { name: string; saleUnit: string; pricePerKg: number | null },
): RenglonDeBalanza {
  if (producto.saleUnit !== "WEIGHT") {
    return { ok: false, mensaje: `"${producto.name}" se vende por unidad, pero el código es de la balanza. Revisá el código del producto en la balanza.` };
  }
  const precio = producto.pricePerKg;
  if (precio == null || !(precio > 0)) {
    return { ok: false, mensaje: `"${producto.name}" no tiene precio por kilo cargado. Cargalo en el catálogo.` };
  }
  if (lectura.contenido === "peso") return { ok: true, cantidad: lectura.peso, importe: null };
  const cantidad = pesoDeUnImporte(lectura.importe, precio);
  if (!(cantidad > 0)) return { ok: false, mensaje: "El importe de la etiqueta es menor que un gramo: volvé a pesar." };
  return { ok: true, cantidad, importe: lectura.importe };
}

/**
 * Los kilos que corresponden a un importe con un precio por kilo, al gramo. La cuenta va en
 * centavos (enteros) y milésimos de kilo: 4.520 pesos a 12.990 el kilo son 0,348 kg.
 */
export function pesoDeUnImporte(importe: number, precioPorKilo: number): number {
  const c = centavosDe(importe);
  const p = centavosDe(precioPorKilo);
  if (!(c > 0) || !(p > 0)) return 0;
  // gramos = c × 1000 / p, redondeado al gramo (medio gramo hacia arriba).
  const gramos = Math.floor((c * 1000 * 2 + p) / (2 * p));
  return gramos / 1000;
}

/**
 * Arma una etiqueta de balanza (para los tests y para la guía de configuración: "así se ve una
 * etiqueta de 1,250 kg del producto 123"). Tira si el valor no entra en los dígitos.
 */
export function armarEtiquetaDeBalanza(
  f: FormatoBalanza,
  plu: string,
  valor: number,
  prefijo: string = f.prefijos[0],
): string {
  const pluTxt = plu.padStart(f.digitosProducto, "0");
  if (!/^\d+$/.test(pluTxt) || pluTxt.length !== f.digitosProducto) throw new RangeError(`PLU inválido para el formato: ${plu}`);
  const entero = Math.round(valor * 10 ** f.decimales);
  const valorTxt = String(entero).padStart(digitosDeValor(f), "0");
  if (valorTxt.length !== digitosDeValor(f)) throw new RangeError(`El valor ${valor} no entra en la etiqueta.`);
  const cuerpo = `${prefijo}${pluTxt}${valorTxt}`;
  // Verificador GS1: la misma cuenta de ean.ts, no una copia.
  return conVerificador(cuerpo);
}

/** El formato en una frase, para la pantalla de configuración. */
export function describirFormato(f: FormatoBalanza): string {
  const valor = digitosDeValor(f);
  const que = f.contenido === "peso" ? (f.decimales === 3 ? "el peso en gramos" : "el peso en decenas de gramos") : f.decimales === 0 ? "el importe en pesos" : f.decimales === 1 ? "el importe con décimos" : "el importe con centavos";
  const prefijos = f.prefijos.length === 10 ? "del 20 al 29" : f.prefijos.join(", ");
  return `Prefijo ${prefijos}, ${f.digitosProducto} dígitos del producto y ${valor} para ${que}.`;
}
