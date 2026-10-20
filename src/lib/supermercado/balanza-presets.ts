// ============================================================================
// PRESETS DE BALANZA — "Mi balanza es…": un punto de partida por marca para la etiqueta.
// ============================================================================
//
// Hoy el dueño tiene que saber cuántos dígitos usa su balanza para configurar la caja. Estos
// presets le dan un punto de partida por marca, y el probador de la pantalla de configuración
// le muestra cómo se lee una etiqueta real ANTES de guardar.
//
// ⚠ A CONFIRMAR con una etiqueta real de cada marca (ver `fuente` en cada preset). El formato no lo fija la
// marca sino el técnico que programa la balanza: la misma Systel puede salir de fábrica con
// peso y quedar configurada con importe. Por eso (a) cada preset es sólo un punto de partida,
// (b) la pantalla dice "si tu etiqueta no se lee, probá otra opción o pedinos ayuda" y
// (c) `presetQueCalza` prueba TODOS los presets contra una etiqueta de verdad.
//
// Los presets usan el MISMO tipo `FormatoBalanza` que guarda la caja (balanza.ts): elegir uno
// sólo rellena el formulario; lo que se guarda sigue siendo el formato, no la marca.
//
// PURO: sin base, sin React. Lo usan la pantalla de configuración (navegador) y los tests.

import {
  FORMATO_BALANZA_POR_DEFECTO,
  codigoParaElFormato,
  formatoDesdeAfuera,
  largoDeEtiqueta,
  largoDelPrefijo,
  leerEtiquetaDeBalanza,
  type FormatoBalanza,
  type LecturaBalanza,
} from "./balanza";
import { limpiarCodigoLeido } from "./ean";

export type IdPresetBalanza = "systel" | "kretz-peso" | "kretz-importe" | "cas" | "moretti" | "gs1-peso" | "gs1-importe";

/**
 * De dónde sale cada preset (docs/producto/balanzas-relevamiento.md, 20/10/2026). Ninguno sale
 * de abrir el manual oficial: el proxy de la sesión bloqueó los sitios de los fabricantes.
 *   · "extracto": el manual oficial existe y está citado; el dato sale del extracto del buscador.
 *   · "sin-fuente": no se encontró el formato de fábrica; es el uso más común. A CONFIRMAR.
 * En pantalla no se dice «provisional» (ambiente real): se dice «confirmalo con una etiqueta», que
 * vale para todos porque el formato lo deja el técnico que programa la balanza.
 */
export type FuentePreset = "extracto" | "sin-fuente";

export interface PresetBalanza {
  id: IdPresetBalanza;
  marca: string;
  descripcion: string;
  formato: FormatoBalanza;
  fuente: FuentePreset;
}

const TODOS_LOS_PREFIJOS = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];

/**
 * Los presets, en el orden en que se muestran. Toledo (Prix), Dibal y Digi no tienen preset: son
 * configurables y no se encontró su formato de fábrica; para esas (y cualquier otra) está
 * «Detectar con una etiqueta» (balanza-deteccion.ts).
 */
export const PRESETS_BALANZA: readonly PresetBalanza[] = [
  {
    id: "systel",
    marca: "Systel (Cuora)",
    // Manual Cuora: cabecera 20 (21 para lo que se vende por unidad), PLU de 4 e importe de 6.
    // Los decimales del importe no figuran en el extracto: pesos enteros, a confirmar.
    descripcion: "Prefijo 20 o 21, producto de 4 dígitos y el importe en pesos (6 dígitos).",
    formato: { prefijos: ["20", "21"], digitosProducto: 4, contenido: "importe", decimales: 0 },
    fuente: "extracto",
  },
  {
    id: "kretz-peso",
    marca: "Kretz (Report), con peso",
    // Manual Report NX/LT/Pro: cabecera 20, formato 2-5-5 con peso o importe según el menú.
    descripcion: "Prefijo 20, producto de 5 dígitos y el peso en gramos.",
    formato: { prefijos: ["20"], digitosProducto: 5, contenido: "peso", decimales: 3 },
    fuente: "extracto",
  },
  {
    id: "kretz-importe",
    marca: "Kretz (Report), con importe",
    descripcion: "Prefijo 20, producto de 5 dígitos y el importe en pesos (hasta $99.999).",
    formato: { prefijos: ["20"], digitosProducto: 5, contenido: "importe", decimales: 0 },
    fuente: "extracto",
  },
  {
    id: "cas",
    marca: "CAS (CL5000, LP)",
    // Manual CAS: "02-IIIII-PPPPP-C", o sea un UPC-A "2 IIIII PPPPP C" que el lector manda con un 0
    // adelante. Decimales del importe a confirmar (el de fábrica es de dólares, con centavos).
    descripcion: "Etiqueta de 12 dígitos: 2, producto de 5 dígitos y el importe (5 dígitos).",
    formato: { prefijos: ["2"], digitosProducto: 5, contenido: "importe", decimales: 0, largo: 12 },
    fuente: "extracto",
  },
  {
    id: "moretti",
    marca: "Moretti",
    descripcion: "Prefijo del 20 al 29, producto de 4 dígitos y el importe en pesos (hasta $999.999).",
    formato: { prefijos: TODOS_LOS_PREFIJOS, digitosProducto: 4, contenido: "importe", decimales: 0 },
    fuente: "sin-fuente",
  },
  {
    id: "gs1-peso",
    marca: "Otra marca, etiqueta con peso",
    descripcion: "El formato más común: prefijo del 20 al 29, producto de 5 dígitos y el peso en gramos.",
    formato: FORMATO_BALANZA_POR_DEFECTO,
    fuente: "sin-fuente",
  },
  {
    id: "gs1-importe",
    marca: "Otra marca, etiqueta con importe",
    descripcion: "Prefijo del 20 al 29, producto de 5 dígitos y el importe en pesos (hasta $99.999).",
    formato: { prefijos: TODOS_LOS_PREFIJOS, digitosProducto: 5, contenido: "importe", decimales: 0 },
    fuente: "sin-fuente",
  },
];

function mismoFormato(a: FormatoBalanza, b: FormatoBalanza): boolean {
  const na = formatoDesdeAfuera(a);
  const nb = formatoDesdeAfuera(b);
  if (!na || !nb) return false;
  return (
    na.digitosProducto === nb.digitosProducto &&
    na.contenido === nb.contenido &&
    na.decimales === nb.decimales &&
    na.prefijos.join(",") === nb.prefijos.join(",") &&
    (na.largo ?? 13) === (nb.largo ?? 13) &&
    Boolean(na.verificadorDePrecio) === Boolean(nb.verificadorDePrecio)
  );
}

/** El preset que coincide exacto con un formato (para mostrarlo elegido), o null si es "a mano". */
export function presetDelFormato(f: FormatoBalanza): IdPresetBalanza | null {
  return PRESETS_BALANZA.find((p) => mismoFormato(p.formato, f))?.id ?? null;
}

export function presetPorId(id: string): PresetBalanza | null {
  return PRESETS_BALANZA.find((p) => p.id === id) ?? null;
}

/**
 * Los presets que leen bien esta etiqueta (prefijo suyo, verificador que cierra, valor > 0).
 * Puede dar más de uno: el mismo código de 13 dígitos se lee como peso o como importe según el
 * formato. Por eso la pantalla muestra la lectura de cada uno y el dueño la compara con lo que
 * dice impreso la etiqueta.
 */
export function presetQueCalza(codigoEjemplo: string): IdPresetBalanza[] {
  const codigo = limpiarCodigoLeido(codigoEjemplo);
  return PRESETS_BALANZA.filter((p) => leerEtiquetaDeBalanza(codigo, p.formato).ok).map((p) => p.id);
}

/** Lo que muestra el probador de etiqueta: nada, un aviso, o la lectura con el formato elegido. */
export type ResultadoDelProbador =
  | { estado: "vacio" }
  | { estado: "aviso"; codigo: string; mensaje: string }
  | { estado: "leida"; codigo: string; lectura: Extract<LecturaBalanza, { ok: true }> };

/**
 * Prueba una etiqueta (escaneada o pegada) con un formato, sin guardar nada. Los avisos son
 * más precisos que los de la caja porque acá se está configurando: dice si faltan dígitos, si
 * el prefijo no es de esta balanza o si el verificador no cierra.
 */
export function probarEtiqueta(texto: string, f: FormatoBalanza): ResultadoDelProbador {
  const leido = limpiarCodigoLeido(texto);
  if (!leido) return { estado: "vacio" };
  if (!/^\d+$/.test(leido)) {
    return { estado: "aviso", codigo: leido, mensaje: "La etiqueta de la balanza son sólo números. Pasala de nuevo por el lector." };
  }
  const codigo = codigoParaElFormato(leido, f);
  const largo = largoDeEtiqueta(f);
  if (codigo.length !== largo) {
    return {
      estado: "aviso",
      codigo: leido,
      mensaje: `La etiqueta tiene ${largo} dígitos y acá hay ${leido.length}. Pasala de nuevo por el lector o revisá lo que pegaste.`,
    };
  }
  const prefijo = codigo.slice(0, largoDelPrefijo(f));
  if (!f.prefijos.includes(prefijo)) {
    return {
      estado: "aviso",
      codigo: leido,
      mensaje: `Empieza con ${prefijo} y ese prefijo no está marcado arriba. Si es de tu balanza, marcalo o probá otra opción.`,
    };
  }
  const lectura = leerEtiquetaDeBalanza(codigo, f);
  if (!lectura.ok) return { estado: "aviso", codigo: leido, mensaje: lectura.mensaje };
  return { estado: "leida", codigo: leido, lectura };
}
