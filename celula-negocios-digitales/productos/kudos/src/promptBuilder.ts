/**
 * Construcción de prompts para el generador de respuestas.
 *
 * Diseño clave para COGS bajo: el kit de voz de marca es un bloque ESTABLE que se cachea
 * (prompt caching de Anthropic). La reseña concreta es la parte VOLÁTIL y va aparte.
 * Ver ARQUITECTURA.md §6.
 */
import type { BrandVoice, BucketRating, Review } from "./types.js";

/** System prompt = identidad + kit de voz de marca. Estable → cacheable. */
export function construirSystemPrompt(voz: BrandVoice): string {
  const emojis =
    voz.emojis === "ninguno"
      ? "No uses emojis."
      : voz.emojis === "pocos"
        ? "Usá como máximo un emoji, solo si suma calidez."
        : "Podés usar emojis con soltura, acorde a la marca.";

  return [
    `Sos el/la community manager de "${voz.nombreMarca}", un/a ${voz.rubro}.`,
    `Tu trabajo es responder reseñas de clientes en Google/MercadoLibre con la voz de la marca.`,
    ``,
    `VOZ DE LA MARCA:`,
    `- Tono: ${voz.tono}.`,
    `- Trato al cliente: ${voz.trato} (respetá esto siempre).`,
    `- ${emojis}`,
    `- Firmá cada respuesta como: "${voz.firma}".`,
    voz.frasesMarca.length
      ? `- Expresiones propias de la marca que podés usar con naturalidad: ${voz.frasesMarca
          .map((f) => `"${f}"`)
          .join(", ")}.`
      : ``,
    `- Longitud máxima: ${voz.longitudMax} caracteres. Sé breve y humano.`,
    `- Idioma base: ${voz.idiomaBase}. Si la reseña está en otro idioma, respondé en el idioma de la reseña.`,
    ``,
    `REGLAS INVIOLABLES:`,
    `- Nunca admitas responsabilidad legal ni uses lenguaje que comprometa jurídicamente a la marca.`,
    voz.permiteCompensacion
      ? `- Podés ofrecer una solución concreta (ej. reponer el pedido) cuando el caso lo amerite.`
      : `- NO ofrezcas reembolsos, descuentos ni compensaciones. Si el cliente está molesto, derivá al canal privado.`,
    `- Para quejas, invitá SIEMPRE a continuar en privado: ${voz.datosContacto}.`,
    `- Nunca discutas ni contradigas al cliente en público; nunca niegues un hecho sin datos.`,
    voz.prohibiciones.length
      ? `- Prohibiciones específicas de esta marca: ${voz.prohibiciones.join("; ")}.`
      : ``,
    ``,
    `Respondé SIEMPRE en formato JSON: {"respuesta": "<texto>", "requiereHumano": <bool>, "motivo": "<breve>"}.`,
    `Poné requiereHumano=true si la situación es demasiado delicada para publicar sin que un humano la revise.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const INSTRUCCION_BUCKET: Record<BucketRating, string> = {
  negativa: [
    "Esta reseña es NEGATIVA. Redactá un borrador que:",
    "1) agradezca el comentario y muestre empatía genuina (sin sonar a formulario),",
    "2) se haga cargo sin admitir responsabilidad legal,",
    "3) invite a resolverlo por el canal privado.",
    "No prometas nada que la marca no pueda cumplir. Este borrador lo revisará un humano.",
  ].join(" "),
  neutra: [
    "Esta reseña es NEUTRA (3★). Agradecé el comentario, valorá lo positivo que haya y mostrá",
    "voluntad de mejorar en lo que el cliente marcó. Tono cálido, breve.",
  ].join(" "),
  positiva: [
    "Esta reseña es POSITIVA (4-5★). Agradecé con calidez y personalización, tomando un detalle",
    "concreto de lo que el cliente dijo. Soná a la marca, no a un bot. Invitá a volver.",
  ].join(" "),
};

/** User prompt = la reseña concreta + instrucción del bucket. Parte volátil (no se cachea). */
export function construirUserPrompt(review: Review, bucket: BucketRating): string {
  return [
    INSTRUCCION_BUCKET[bucket],
    ``,
    `RESEÑA (${review.rating}★) de ${review.autor}:`,
    `"""${review.texto}"""`,
  ].join("\n");
}
