// ============================================================================
// PRESETS DE BALANZA — "Mi balanza es…": un punto de partida por marca para la etiqueta.
// ============================================================================
//
// Hoy el dueño tiene que saber cuántos dígitos usa su balanza para configurar la caja. Estos
// presets le dan un punto de partida por marca, y el probador de la pantalla de configuración
// le muestra cómo se lee una etiqueta real ANTES de guardar.
//
// ⚠ PROVISIONALES A CONFIRMAR con una etiqueta real de cada marca. El formato no lo fija la
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
  formatoDesdeAfuera,
  leerEtiquetaDeBalanza,
  type FormatoBalanza,
  type LecturaBalanza,
} from "./balanza";
import { limpiarCodigoLeido } from "./ean";

export type IdPresetBalanza = "systel" | "kretz" | "moretti" | "gs1-peso" | "gs1-importe";

export interface PresetBalanza {
  id: IdPresetBalanza;
  marca: string;
  descripcion: string;
  formato: FormatoBalanza;
}

const TODOS_LOS_PREFIJOS = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];

/** Los presets, en el orden en que se muestran. PROVISIONALES A CONFIRMAR (ver arriba). */
export const PRESETS_BALANZA: readonly PresetBalanza[] = [
  {
    id: "systel",
    marca: "Systel",
    descripcion: "Prefijo 20, producto de 5 dígitos y el peso en gramos.",
    formato: { prefijos: ["20"], digitosProducto: 5, contenido: "peso", decimales: 3 },
  },
  {
    id: "kretz",
    marca: "Kretz",
    descripcion: "Prefijo 20 o 21, producto de 5 dígitos y el importe en pesos (hasta $99.999).",
    formato: { prefijos: ["20", "21"], digitosProducto: 5, contenido: "importe", decimales: 0 },
  },
  {
    id: "moretti",
    marca: "Moretti",
    descripcion: "Prefijo del 20 al 29, producto de 4 dígitos y el importe en pesos (hasta $999.999).",
    formato: { prefijos: TODOS_LOS_PREFIJOS, digitosProducto: 4, contenido: "importe", decimales: 0 },
  },
  {
    id: "gs1-peso",
    marca: "Otra marca, etiqueta con peso",
    descripcion: "El formato más común: prefijo del 20 al 29, producto de 5 dígitos y el peso en gramos.",
    formato: FORMATO_BALANZA_POR_DEFECTO,
  },
  {
    id: "gs1-importe",
    marca: "Otra marca, etiqueta con importe",
    descripcion: "Prefijo del 20 al 29, producto de 5 dígitos y el importe en pesos (hasta $99.999).",
    formato: { prefijos: TODOS_LOS_PREFIJOS, digitosProducto: 5, contenido: "importe", decimales: 0 },
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
    na.prefijos.join(",") === nb.prefijos.join(",")
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
  const codigo = limpiarCodigoLeido(texto);
  if (!codigo) return { estado: "vacio" };
  if (!/^\d+$/.test(codigo)) {
    return { estado: "aviso", codigo, mensaje: "La etiqueta de la balanza son sólo números. Pasala de nuevo por el lector." };
  }
  if (codigo.length !== 13) {
    return {
      estado: "aviso",
      codigo,
      mensaje: `La etiqueta tiene 13 dígitos y acá hay ${codigo.length}. Pasala de nuevo por el lector o revisá lo que pegaste.`,
    };
  }
  if (!f.prefijos.includes(codigo.slice(0, 2))) {
    return {
      estado: "aviso",
      codigo,
      mensaje: `Empieza con ${codigo.slice(0, 2)} y ese prefijo no está marcado arriba. Si es de tu balanza, marcalo o probá otra opción.`,
    };
  }
  const lectura = leerEtiquetaDeBalanza(codigo, f);
  if (!lectura.ok) return { estado: "aviso", codigo, mensaje: lectura.mensaje };
  return { estado: "leida", codigo, lectura };
}
