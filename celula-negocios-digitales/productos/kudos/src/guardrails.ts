/**
 * Guardarraíles de salida.
 *
 * Antes de dar por buena una respuesta generada, la validamos. Si algo falla, degradamos
 * el estado a "revisar_humano" (nunca publicamos algo dudoso solo). El costo de una mala
 * respuesta pública es mucho mayor que el de una revisión humana.
 */
import type { BrandVoice } from "./types.js";

export interface ResultadoGuardarrail {
  ok: boolean;
  advertencias: string[];
}

/** Frases que sugieren admisión de responsabilidad legal — nunca deben publicarse. */
const ADMISION_LEGAL = [
  /\bfue nuestra culpa\b/i,
  /\bnos hacemos responsables legalmente\b/i,
  /\breconocemos la responsabilidad\b/i,
  /\bacepto la demanda\b/i,
];

/** Frases de compensación (solo permitidas si el kit de voz lo habilita). */
const COMPENSACION = [
  /\bte devolvemos (el|la|tu)\b/i,
  /\breembols/i,
  /\bdescuento del? \d+/i,
  /\bte regalamos\b/i,
  /\bvale por\b/i,
];

export function validarSalida(texto: string, voz: BrandVoice): ResultadoGuardarrail {
  const advertencias: string[] = [];

  if (texto.trim().length === 0) {
    advertencias.push("Respuesta vacía.");
  }

  if (texto.length > voz.longitudMax) {
    advertencias.push(`Excede el largo máximo (${texto.length} > ${voz.longitudMax}).`);
  }

  if (ADMISION_LEGAL.some((r) => r.test(texto))) {
    advertencias.push("Contiene posible admisión de responsabilidad legal.");
  }

  if (!voz.permiteCompensacion && COMPENSACION.some((r) => r.test(texto))) {
    advertencias.push("Ofrece compensación no autorizada por el kit de voz.");
  }

  // La firma debe estar presente (identidad de marca).
  if (voz.firma && !texto.includes(voz.firma)) {
    advertencias.push("Falta la firma de la marca.");
  }

  return { ok: advertencias.length === 0, advertencias };
}
