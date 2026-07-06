/**
 * Abstracción del LLM.
 *
 * El núcleo (reviewResponder) depende de esta interfaz, no de un proveedor concreto.
 * - MockLLM: determinista, offline. Permite correr `src/examples.ts` sin API key ni npm install.
 * - AnthropicLLM (src/anthropicClient.ts): implementación de referencia real con Claude Sonnet.
 */
import type { BrandVoice, BucketRating, Review } from "./types.js";

export interface SalidaLLM {
  respuesta: string;
  requiereHumano: boolean;
  motivo: string;
  /** Identificador del generador para trazabilidad (ej. "mock", "claude-sonnet-5"). */
  generadoPor: string;
}

export interface LLM {
  generar(input: {
    systemPrompt: string;
    userPrompt: string;
    review: Review;
    voz: BrandVoice;
    bucket: BucketRating;
  }): Promise<SalidaLLM>;
}

/**
 * Mock determinista: imita el comportamiento de Claude por bucket, en español, con la voz
 * de la marca. Sirve para demo y tests sin costo ni red. NO es el generador de producción.
 */
export class MockLLM implements LLM {
  async generar(input: {
    review: Review;
    voz: BrandVoice;
    bucket: BucketRating;
  }): Promise<SalidaLLM> {
    const { review, voz, bucket } = input;
    const vos = voz.trato === "voseo";
    const tuNombre = review.autor || (vos ? "vos" : "tú");
    const emoji = voz.emojis === "ninguno" ? "" : bucket === "positiva" ? " 🙌" : "";

    let respuesta: string;
    if (bucket === "positiva") {
      respuesta =
        `¡Gracias por tu reseña, ${tuNombre}!${emoji} Nos alegra un montón que la hayas pasado bien. ` +
        `Te esperamos pronto de nuevo. ${voz.firma}`;
    } else if (bucket === "neutra") {
      respuesta =
        `Gracias por tu comentario, ${tuNombre}. Tomamos nota de lo que marcás para seguir mejorando. ` +
        `Ojalá la próxima te lleves una mejor experiencia. ${voz.firma}`;
    } else {
      respuesta =
        `Lamentamos que tu experiencia no haya sido la esperada, ${tuNombre}. Queremos entender qué pasó ` +
        `y ayudarte: ${vos ? "escribinos" : "escríbenos"} a ${voz.datosContacto} así lo resolvemos como corresponde. ${voz.firma}`;
    }

    // Respetar el tope de longitud del kit de voz.
    if (respuesta.length > voz.longitudMax) {
      respuesta = respuesta.slice(0, voz.longitudMax - 1).trimEnd() + "…";
    }

    return {
      respuesta,
      requiereHumano: bucket === "negativa",
      motivo: `mock: respuesta ${bucket} con voz de ${voz.nombreMarca}`,
      generadoPor: "mock",
    };
  }
}
