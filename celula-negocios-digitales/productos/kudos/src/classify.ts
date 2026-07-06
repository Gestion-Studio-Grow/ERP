/**
 * Clasificación y ruteo de una reseña ANTES de generar la respuesta.
 * Puro y testeable, sin llamadas a la IA.
 */
import type { BucketRating, EstadoRespuesta, Review } from "./types.js";
import { detectarSensible } from "./sensitive.js";

export function bucketDeRating(rating: Review["rating"]): BucketRating {
  if (rating <= 2) return "negativa";
  if (rating === 3) return "neutra";
  return "positiva";
}

export interface Ruteo {
  bucket: BucketRating;
  /** Estado propuesto ANTES de correr la generación + guardarraíles. */
  estadoPropuesto: EstadoRespuesta;
  categoriaSensible?: ReturnType<typeof detectarSensible>;
  motivo: string;
  /** Si es false, ni siquiera generamos (escalado duro): un humano redacta. */
  generar: boolean;
}

/**
 * Decide el destino de la reseña:
 *  - tema sensible  → escalar (no se genera; humano redacta)
 *  - 1-2★           → generar borrador, pero requiere revisión humana
 *  - 3★             → generar, autopublicable
 *  - 4-5★           → generar, autopublicable
 */
export function rutear(review: Review): Ruteo {
  const bucket = bucketDeRating(review.rating);
  const categoriaSensible = detectarSensible(review.texto);

  if (categoriaSensible) {
    return {
      bucket,
      estadoPropuesto: "escalar",
      categoriaSensible,
      generar: false,
      motivo: `Tema sensible detectado (${categoriaSensible}): no se publica, se alerta al equipo.`,
    };
  }

  if (bucket === "negativa") {
    return {
      bucket,
      estadoPropuesto: "revisar_humano",
      generar: true,
      motivo: "Reseña negativa (1-2★): se genera borrador empático, requiere OK humano antes de publicar.",
    };
  }

  return {
    bucket,
    estadoPropuesto: "auto",
    generar: true,
    motivo:
      bucket === "neutra"
        ? "Reseña neutra (3★): agradece y muestra voluntad de mejora. Autopublicable."
        : "Reseña positiva (4-5★): agradecimiento cálido con voz de marca. Autopublicable.",
  };
}
