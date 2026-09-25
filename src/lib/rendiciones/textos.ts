/**
 * RENDÍ — nombres para mostrar (Core, PURO). Zona humana (ADR-046): lo que lee quien rinde.
 */

import type { ClaseComprobante, CodigoJurisdiccion } from "./tipos";

const JURISDICCIONES: Record<CodigoJurisdiccion, string> = {
  CABA: "Ciudad de Buenos Aires",
  BA: "Buenos Aires",
  CA: "Catamarca",
  CB: "Córdoba",
  CR: "Corrientes",
  CH: "Chaco",
  CT: "Chubut",
  ER: "Entre Ríos",
  FO: "Formosa",
  JU: "Jujuy",
  LP: "La Pampa",
  LR: "La Rioja",
  MZ: "Mendoza",
  MI: "Misiones",
  NQ: "Neuquén",
  RN: "Río Negro",
  SA: "Salta",
  SJ: "San Juan",
  SL: "San Luis",
  SC: "Santa Cruz",
  SF: "Santa Fe",
  SE: "Santiago del Estero",
  TF: "Tierra del Fuego",
  TU: "Tucumán",
};

/** NQ → "Neuquén". Para mensajes ("Gasto en Neuquén: …"). */
export function nombreJurisdiccion(c: CodigoJurisdiccion): string {
  return JURISDICCIONES[c] ?? c;
}

const CLASES: Record<ClaseComprobante, string> = {
  factura_a: "Factura A",
  factura_b: "Factura B",
  factura_c: "Factura C",
  factura_m: "Factura M",
  tique_factura_a: "Tique factura A",
  tique_peaje: "Tique de peaje",
  tique_consumidor_final: "Tique",
  sin_comprobante: "Sin comprobante",
};

/** factura_a → "Factura A". */
export function etiquetaClase(c: ClaseComprobante): string {
  return CLASES[c];
}
