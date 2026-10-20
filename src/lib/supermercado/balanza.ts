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
// FORMATOS QUE TAMBIÉN ENTRAN (campos opcionales: lo ya guardado se lee igual que antes):
//   · Prefijo de UN dígito ("2"): 2 │ producto │ valor │ verificador.
//   · `largo` 12 (UPC-A, el de las balanzas de origen norteamericano): 12 dígitos; el lector
//     a veces lo manda como EAN-13 con un 0 adelante, y se lee igual.
//   · `verificadorDePrecio`: un dígito de control GS1 del valor, pegado antes del valor
//     (sólo con 4 o 5 dígitos de valor, como dice GS1). Si no cierra, la etiqueta se rechaza.
//
//     prefijo │ producto │ [control del precio] │ valor │ verificador   (12 o 13 dígitos)
//
// PURO: sin base, sin React. Lo usan la caja (navegador), la acción del servidor y los tests.

import { conVerificador, esGtinValido } from "./ean";
import { redondearCantidad } from "@/lib/pos-peso";
import { centavosDe, redondearAlCentavo } from "@/lib/dinero/redondeo";

export type ContenidoDeBalanza = "peso" | "importe";

export interface FormatoBalanza {
  /** Prefijos que imprime la balanza: de dos dígitos ("20" a "29") o el de uno ("2"). */
  prefijos: string[];
  /** Dígitos del código del producto (PLU) después del prefijo. */
  digitosProducto: 4 | 5 | 6;
  contenido: ContenidoDeBalanza;
  /** Dígitos del valor que van después de la coma. */
  decimales: number;
  /** 13 (EAN-13, lo común) o 12 (UPC-A). Sin el campo, 13. */
  largo?: 12 | 13;
  /** Dígito de control GS1 del valor, antes del valor. Sin el campo, no lleva. */
  verificadorDePrecio?: boolean;
}

/** El formato más común en las balanzas de acá: 20 + PLU de 5 + peso en gramos (5) + verificador. */
export const FORMATO_BALANZA_POR_DEFECTO: FormatoBalanza = {
  prefijos: ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"],
  digitosProducto: 5,
  contenido: "peso",
  decimales: 3,
};

const PREFIJOS_VALIDOS = new Set(["2", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]);

type Disposicion = Pick<FormatoBalanza, "digitosProducto"> & Partial<Pick<FormatoBalanza, "prefijos" | "largo" | "verificadorDePrecio">>;

/** El largo de la etiqueta: 13 salvo que el formato diga 12. */
export function largoDeEtiqueta(f: Pick<FormatoBalanza, "largo">): 12 | 13 {
  return f.largo === 12 ? 12 : 13;
}

/** Cuántos dígitos tiene el prefijo (todos los prefijos de un formato tienen el mismo largo). */
export function largoDelPrefijo(f: Partial<Pick<FormatoBalanza, "prefijos">>): number {
  return f.prefijos?.[0]?.length === 1 ? 1 : 2;
}

/** Cuántos dígitos del código son el valor (peso o importe). */
export function digitosDeValor(f: Disposicion): number {
  return largoDeEtiqueta(f) - 1 - largoDelPrefijo(f) - f.digitosProducto - (f.verificadorDePrecio ? 1 : 0);
}

/**
 * ¿La configuración tiene sentido? Devuelve el problema en castellano, o null. La usa la
 * pantalla antes de guardar y el servidor antes de escribir: lo que llega del navegador no se
 * asume.
 */
export function problemaDelFormato(f: unknown): string | null {
  if (!f || typeof f !== "object") return "Falta la configuración de la balanza.";
  const o = f as Record<string, unknown>;
  if (!Array.isArray(o.prefijos) || o.prefijos.length === 0) return "Elegí al menos un prefijo (del 20 al 29, o el 2 solo).";
  if (!o.prefijos.every((p) => typeof p === "string" && PREFIJOS_VALIDOS.has(p))) {
    return "Los prefijos de la balanza van del 20 al 29, o el 2 solo.";
  }
  if (new Set(o.prefijos.map((p) => (p as string).length)).size > 1) {
    return "El 2 solo no se mezcla con los prefijos de dos dígitos: elegí uno u otro.";
  }
  if (o.digitosProducto !== 4 && o.digitosProducto !== 5 && o.digitosProducto !== 6) {
    return "El código del producto en la balanza tiene 4, 5 o 6 dígitos.";
  }
  if (o.largo !== undefined && o.largo !== 12 && o.largo !== 13) return "La etiqueta tiene 13 dígitos (EAN-13) o 12 (UPC-A).";
  if (o.verificadorDePrecio !== undefined && typeof o.verificadorDePrecio !== "boolean") return "Falta decir si la etiqueta trae el control del precio.";
  if (o.contenido !== "peso" && o.contenido !== "importe") return "Elegí si la etiqueta trae el peso o el importe.";
  if (typeof o.decimales !== "number" || !Number.isInteger(o.decimales)) return "Los decimales son un número entero.";
  const valor = digitosDeValor({
    digitosProducto: o.digitosProducto,
    prefijos: o.prefijos as string[],
    largo: o.largo as 12 | 13 | undefined,
    verificadorDePrecio: o.verificadorDePrecio as boolean | undefined,
  });
  if (valor < 3) return "Con esos dígitos no queda lugar para el valor: probá con menos dígitos de producto.";
  if (o.verificadorDePrecio && valor !== 4 && valor !== 5) {
    return "El control del precio sólo existe con 4 o 5 dígitos de valor.";
  }
  if (o.contenido === "peso" && o.decimales !== 2 && o.decimales !== 3) {
    return "El peso va en gramos (3 decimales) o en decenas de gramos (2 decimales).";
  }
  if (o.contenido === "importe" && (o.decimales < 0 || o.decimales > 2)) {
    return "El importe va en pesos (0 decimales), con décimos (1) o con centavos (2).";
  }
  if (o.decimales >= valor) return "Con esa cantidad de decimales no queda lugar para la parte entera del valor.";
  return null;
}

/**
 * El formato tal como lo manda el formulario (Caja con lector o Balanza y lector), SIN validar:
 * lo valida `problemaDelFormato`. Los campos nuevos se leen sólo si vienen, así un formulario
 * que no los tiene sigue guardando lo de siempre.
 */
export function formatoDelFormulario(fd: Pick<FormData, "get" | "getAll" | "has">): Record<string, unknown> {
  return {
    prefijos: fd.getAll("prefijos").map(String),
    digitosProducto: Number(fd.get("digitosProducto")),
    contenido: String(fd.get("contenido") ?? ""),
    decimales: Number(fd.get("decimales")),
    ...(fd.has("largo") ? { largo: Number(fd.get("largo")) } : {}),
    ...(fd.has("verificadorDePrecio") ? { verificadorDePrecio: fd.get("verificadorDePrecio") === "si" } : {}),
  };
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
    // Los campos nuevos sólo se escriben cuando cambian algo: el formato de siempre queda igual.
    ...(o.largo === 12 ? { largo: 12 as const } : {}),
    ...(o.verificadorDePrecio ? { verificadorDePrecio: true } : {}),
  };
}

/**
 * El código como lo lee este formato: un UPC-A que el lector mandó como EAN-13 (con un 0
 * adelante) vuelve a sus 12 dígitos. Para los formatos de 13, sin cambios.
 */
export function codigoParaElFormato(codigo: string, f: Pick<FormatoBalanza, "largo">): string {
  return largoDeEtiqueta(f) === 12 && /^0\d{12}$/.test(codigo) ? codigo.slice(1) : codigo;
}

/** ¿Este código tiene la forma de una etiqueta de ESTA balanza? (su largo y un prefijo suyo). */
export function esCodigoDeBalanza(codigo: string, f: FormatoBalanza): boolean {
  const c = codigoParaElFormato(codigo, f);
  return c.length === largoDeEtiqueta(f) && /^\d+$/.test(c) && f.prefijos.includes(c.slice(0, largoDelPrefijo(f)));
}

export type LecturaBalanza =
  | { ok: true; plu: string; contenido: "peso"; peso: number }
  | { ok: true; plu: string; contenido: "importe"; importe: number }
  | { ok: false; mensaje: string };

export const MENSAJE_VERIFICADOR_DE_PRECIO =
  "La etiqueta de la balanza se leyó mal (el control del precio no cierra). Pasala de nuevo por el lector o tipeá el código.";

export const MENSAJE_VERIFICADOR_BALANZA =
  "La etiqueta de la balanza se leyó mal (el último dígito no cierra). Pasala de nuevo por el lector o tipeá el código.";

/**
 * Lee una etiqueta de balanza. Supone que `esCodigoDeBalanza` ya dio true; igual lo vuelve a
 * mirar. El verificador del EAN-13 se controla SIEMPRE: una etiqueta arrugada que el lector
 * lee con un dígito cambiado cobraría otro peso.
 */
export function leerEtiquetaDeBalanza(codigoLeido: string, f: FormatoBalanza): LecturaBalanza {
  if (!esCodigoDeBalanza(codigoLeido, f)) return { ok: false, mensaje: "Ese código no es una etiqueta de la balanza." };
  const codigo = codigoParaElFormato(codigoLeido, f);
  if (!esGtinValido(codigo)) return { ok: false, mensaje: MENSAJE_VERIFICADOR_BALANZA };
  const desde = largoDelPrefijo(f);
  const plu = codigo.slice(desde, desde + f.digitosProducto);
  const inicioValor = desde + f.digitosProducto + (f.verificadorDePrecio ? 1 : 0);
  const valorTxt = codigo.slice(inicioValor, codigo.length - 1);
  if (f.verificadorDePrecio && verificadorDePrecio(valorTxt) !== Number(codigo[inicioValor - 1])) {
    return { ok: false, mensaje: MENSAJE_VERIFICADOR_DE_PRECIO };
  }
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
  const control = f.verificadorDePrecio ? String(verificadorDePrecio(valorTxt)) : "";
  const cuerpo = `${prefijo}${pluTxt}${control}${valorTxt}`;
  // Verificador GS1: la misma cuenta de ean.ts, no una copia.
  return conVerificador(cuerpo);
}

/** El formato en una frase, para la pantalla de configuración. */
export function describirFormato(f: FormatoBalanza): string {
  const valor = digitosDeValor(f);
  const que = f.contenido === "peso" ? (f.decimales === 3 ? "el peso en gramos" : "el peso en decenas de gramos") : f.decimales === 0 ? "el importe en pesos" : f.decimales === 1 ? "el importe con décimos" : "el importe con centavos";
  const prefijos = f.prefijos.length === 10 ? "del 20 al 29" : f.prefijos.join(", ");
  const largo = largoDeEtiqueta(f) === 12 ? " Etiqueta de 12 dígitos (UPC-A)." : "";
  const control = f.verificadorDePrecio ? ", con control del precio" : "";
  return `Prefijo ${prefijos}, ${f.digitosProducto} dígitos del producto y ${valor} para ${que}${control}.${largo}`;
}

// ── El control del precio (GS1, "price verifier digit") ─────────────────────────────────────
//
// Algunas balanzas meten, antes del valor, un dígito que controla sólo el precio: si el lector
// cambia un dígito del importe, ese control no cierra aunque el verificador del final sí. La
// cuenta es la de GS1 (Especificaciones Generales, cálculo del dígito de control de precio) con
// sus cuatro tablas de ponderación:
//   2-  : el doble, y si pasa de 9 se le resta la decena a la unidad  (6 → 12 → 2 − 1 = 1)
//   3   : el triple, sólo la unidad                                   (7 → 21 → 1)
//   5+  : el quíntuple, sumando la decena a la unidad                 (8 → 40 → 0 + 4 = 4)
//   5-  : el quíntuple, restando la decena a la unidad                (6 → 30 → 0 − 3 → 7)
// Con 4 dígitos de valor: pesos 2-, 2-, 3, 5-; la suma por 3, y la unidad es el control.
// Con 5 dígitos: pesos 5+, 2-, 5-, 5+, 2-; el control es el dígito cuyo 5- da 10 − (suma mod 10).
// Ejemplos de GS1: 2875 → 9; 14685 → 6 (los prueba balanza.test.ts).

const POR_2_MENOS = [0, 2, 4, 6, 8, 9, 1, 3, 5, 7];
const POR_3 = [0, 3, 6, 9, 2, 5, 8, 1, 4, 7];
const POR_5_MAS = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9];
const POR_5_MENOS = [0, 5, 9, 4, 8, 3, 7, 2, 6, 1];

/** El dígito de control GS1 de un valor de 4 o 5 dígitos. Tira con otro largo (error de quien llama). */
export function verificadorDePrecio(valor: string): number {
  if (!/^\d{4,5}$/.test(valor)) throw new RangeError(`El control del precio va con 4 o 5 dígitos: "${valor}".`);
  const d = [...valor].map(Number);
  if (d.length === 4) {
    const suma = POR_2_MENOS[d[0]] + POR_2_MENOS[d[1]] + POR_3[d[2]] + POR_5_MENOS[d[3]];
    return (suma * 3) % 10;
  }
  const suma = POR_5_MAS[d[0]] + POR_2_MENOS[d[1]] + POR_5_MENOS[d[2]] + POR_5_MAS[d[3]] + POR_2_MENOS[d[4]];
  const buscado = (10 - (suma % 10)) % 10;
  return POR_5_MENOS.indexOf(buscado);
}
