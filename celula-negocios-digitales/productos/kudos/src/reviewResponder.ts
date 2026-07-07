/**
 * EL CORAZÓN DE KUDOS.
 *
 * Toma (reseña + perfil de voz de marca) y produce la respuesta apropiada, con:
 *  - ruteo por estrellas (1★ distinto de 5★),
 *  - escalado a humano en temas sensibles,
 *  - generación con voz de marca (Claude Sonnet en prod / MockLLM en demo),
 *  - guardarraíles de salida que degradan a revisión humana ante cualquier duda.
 *
 * Es puro respecto del LLM: recibe la implementación por inyección (ver src/llm.ts).
 */
import type { BrandVoice, ResultadoRespuesta, Review } from "./types.js";
import type { LLM } from "./llm.js";
import { rutear } from "./classify.js";
import { construirSystemPrompt, construirUserPrompt } from "./promptBuilder.js";
import { validarSalida } from "./guardrails.js";

export async function responderResena(
  review: Review,
  voz: BrandVoice,
  llm: LLM,
): Promise<ResultadoRespuesta> {
  const ruteo = rutear(review);

  // Caso 1: escalado duro (tema sensible). No generamos: un humano redacta.
  if (!ruteo.generar) {
    return {
      reviewId: review.id,
      estado: "escalar",
      bucket: ruteo.bucket,
      respuesta: "",
      categoriaSensible: ruteo.categoriaSensible,
      motivo: ruteo.motivo,
      brandVoiceVersion: voz.version,
      generadoPor: "n/a (escalado sin generar)",
      advertencias: [],
    };
  }

  // Caso 2: generamos con la voz de marca.
  const systemPrompt = construirSystemPrompt(voz);
  const userPrompt = construirUserPrompt(review, ruteo.bucket);

  const salida = await llm.generar({
    systemPrompt,
    userPrompt,
    review,
    voz,
    bucket: ruteo.bucket,
  });

  // Guardarraíles de salida.
  const check = validarSalida(salida.respuesta, voz);
  const advertencias = [...check.advertencias];

  // Estado final: parte del ruteo, pero se DEGRADA (nunca se relaja) por:
  //  - guardarraíles fallidos,
  //  - el propio modelo pidiendo revisión humana.
  let estado = ruteo.estadoPropuesto;
  let motivo = ruteo.motivo;

  if (!check.ok) {
    if (estado === "auto") {
      estado = "revisar_humano";
      motivo += " → Degradado a revisión humana por guardarraíles.";
    }
  }
  if (salida.requiereHumano && estado === "auto") {
    estado = "revisar_humano";
    motivo += " → El modelo marcó la respuesta como delicada (requiereHumano).";
    advertencias.push("El modelo pidió revisión humana.");
  }

  return {
    reviewId: review.id,
    estado,
    bucket: ruteo.bucket,
    respuesta: salida.respuesta,
    categoriaSensible: ruteo.categoriaSensible,
    motivo,
    brandVoiceVersion: voz.version,
    generadoPor: salida.generadoPor,
    advertencias,
  };
}
