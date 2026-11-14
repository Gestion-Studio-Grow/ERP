// ============================================================================
// Carnicería — ETIQUETA DE CADA PAQUETE AL VACÍO de un lote. PURA (sin base, sin React).
// ============================================================================
//
// Cada paquete del lote sale con: nombre, peso, $/kg, total, lote, envasado, vence, la leyenda
// de conservación y un CÓDIGO DE BALANZA (EAN-13 de uso interno 20–29, o UPC-A si el negocio
// configuró largo 12) que la caja ya sabe leer (supermercado/balanza.ts: leerEtiquetaDeBalanza).
// El código se arma con el MISMO formato que la caja lee (leerConfigCaja), así lo que se imprime
// acá se cobra allá sin tocar nada.
//
// El encoder EAN-13 es el algoritmo estándar GS1: guardas 101 · 6 dígitos izquierdos en L o G
// según la paridad del 1.er dígito · guarda central 01010 · 6 dígitos derechos en R · guarda 101
// = 95 módulos. Un UPC-A son los mismos barras que el EAN-13 con un 0 adelante.

import { armarEtiquetaDeBalanza, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { esGtinValido } from "@/lib/supermercado/ean";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { diaDelLote, fmtDia } from "./lotes";
import { LEYENDA_CONSERVACION } from "./etiqueta-paquete-config";

// --- Encoder EAN-13 ---------------------------------------------------------------------------

/** Código L (impar) de cada dígito, 7 módulos; "1" = barra. */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
/** Código G (par) = R invertido. */
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
/** Código R (lado derecho) = L complementado. */
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Paridad de los 6 dígitos izquierdos según el 1.er dígito (L o G). */
const PARIDAD = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export const MODULOS_EAN13 = 95;

/**
 * Los 95 módulos de un EAN-13 (o de un UPC-A de 12, que se codifica con un 0 adelante), como
 * texto de "0"/"1". Tira RangeError si el código no tiene 12/13 dígitos o el verificador no cierra.
 */
export function modulosEan13(codigo: string): string {
  const c = /^\d{12}$/.test(codigo) ? `0${codigo}` : codigo;
  if (!/^\d{13}$/.test(c)) throw new RangeError(`El código ${codigo} no es un EAN-13 ni un UPC-A.`);
  if (!esGtinValido(c)) throw new RangeError(`El último dígito de ${codigo} no cierra.`);
  const d = [...c].map(Number);
  const paridad = PARIDAD[d[0]];
  let m = "101";
  for (let i = 1; i <= 6; i++) m += (paridad[i - 1] === "L" ? L : G)[d[i]];
  m += "01010";
  for (let i = 7; i <= 12; i++) m += R[d[i]];
  return m + "101";
}

export type BarraSvg = { x: number; ancho: number };

/** Las barras (corridas de "1") de los módulos, en unidades de módulo, para dibujar un SVG. */
export function barrasDeModulos(modulos: string): BarraSvg[] {
  const barras: BarraSvg[] = [];
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] !== "1") {
      i++;
      continue;
    }
    const x = i;
    while (i < modulos.length && modulos[i] === "1") i++;
    barras.push({ x, ancho: i - x });
  }
  return barras;
}

// --- Datos de la etiqueta -----------------------------------------------------------------------

// La leyenda por defecto vive con la config de la etiqueta (configurable por negocio).
export { LEYENDA_CONSERVACION } from "./etiqueta-paquete-config";

export interface EntradaEtiquetaDePaquete {
  producto: { nombre: string; codigo: string | null; precioPorKilo: number };
  lote: { code: string; packedAt: Date | null; expiresAt: Date | null };
  pesoKg: number;
  formato: FormatoBalanza;
  negocio: string;
  /** La leyenda de conservación del negocio; sin ella, la de fábrica. */
  leyenda?: string;
}

export interface EtiquetaDePaquete {
  negocio: string;
  nombre: string;
  pesoKg: number;
  precioPorKilo: number;
  total: number;
  lote: string;
  envasado: string | null;
  vence: string | null;
  leyenda: string;
  /** El código de balanza (12 o 13 dígitos), o null con el motivo en criollo. */
  codigo: string | null;
  motivoSinCodigo: string | null;
}

/** Lo que imprime la etiqueta de un paquete. PURA. */
export function datosDeEtiquetaDePaquete(e: EntradaEtiquetaDePaquete): EtiquetaDePaquete {
  // Con formato de IMPORTE la caja cobra lo que dice el código: el total impreso se redondea a
  // los mismos decimales, para que el cliente vea lo mismo que paga.
  const bruto = redondearAlCentavo(e.pesoKg * e.producto.precioPorKilo);
  const total =
    e.formato.contenido === "importe" ? redondearAlCentavo(Math.round(bruto * 10 ** e.formato.decimales) / 10 ** e.formato.decimales) : bruto;
  const envasado = diaDelLote(e.lote.packedAt);
  const vence = diaDelLote(e.lote.expiresAt);
  const base = {
    negocio: e.negocio,
    nombre: e.producto.nombre,
    pesoKg: e.pesoKg,
    precioPorKilo: e.producto.precioPorKilo,
    total,
    lote: e.lote.code,
    envasado: envasado ? fmtDia(envasado) : null,
    vence: vence ? fmtDia(vence) : null,
    leyenda: e.leyenda ?? LEYENDA_CONSERVACION,
  };
  const r = codigoDelPaquete(e.producto.codigo, e.formato, e.formato.contenido === "peso" ? e.pesoKg : total);
  return { ...base, ...r };
}

function codigoDelPaquete(
  codigoProducto: string | null,
  f: FormatoBalanza,
  valor: number,
): { codigo: string | null; motivoSinCodigo: string | null } {
  const plu = (codigoProducto ?? "").trim();
  const sinCodigo = (motivo: string) => ({ codigo: null, motivoSinCodigo: motivo });
  if (!plu) return sinCodigo("El producto no tiene código: cargale el código de la balanza en el catálogo.");
  if (!/^\d+$/.test(plu) || plu.length > f.digitosProducto) {
    return sinCodigo(`El código del producto (${plu}) no es un número de hasta ${f.digitosProducto} dígitos, como pide la balanza.`);
  }
  // La caja busca el PLU leído con todos sus ceros o sin ninguno: un "0123" en un formato de 5
  // se leería "00123" → "123", y no lo encontraría.
  if (plu.startsWith("0") && plu.length !== f.digitosProducto) {
    return sinCodigo(`El código del producto (${plu}) empieza con 0: cargalo sin los ceros de adelante o con los ${f.digitosProducto} dígitos.`);
  }
  if (!(valor > 0)) return sinCodigo("El peso del paquete tiene que ser mayor que cero.");
  try {
    return { codigo: armarEtiquetaDeBalanza(f, plu, valor), motivoSinCodigo: null };
  } catch {
    return sinCodigo(f.contenido === "peso" ? "El peso no entra en el código de la balanza: revisá el peso del paquete." : "El importe no entra en el código de la balanza: es demasiado grande para el formato.");
  }
}
