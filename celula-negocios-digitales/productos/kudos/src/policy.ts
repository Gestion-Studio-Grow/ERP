/**
 * Lint de política de Google para el COPY DE CAPTACIÓN (no para las respuestas).
 *
 * Google prohíbe el "review gating": pedir reseña sólo a los contentos, o condicionar/desviar
 * según el sentimiento. Violarlo puede costar la baja del perfil del cliente. Este lint corre
 * ANTES de enviar cualquier copy de captación (QR landing / WhatsApp) y bloquea frases de gating.
 *
 * Facilitar el proceso (link directo, recordatorio único) está permitido. Filtrar por sentimiento,
 * NO. Este archivo materializa esa línea.
 */

const FRASES_GATING = [
  /\bsi est(á|a)s? content[oa]\b/i,
  /\bsi te gust(ó|o)\b/i,
  /\bsi qued(a|á)ste satisfech[oa]\b/i,
  /\b¿?nos recomendar(í|i)as\b/i,
  /\bsolo si\b/i,
  /\bc(ó|o)mo nos calificar(í|i)as\b/i, // encuesta previa que desvía insatisfechos
  /\bdel 1 al \d+\b/i, // scoring previo tipo NPS que rutea según respuesta
  /\bif you('| a)?re happy\b/i,
  /\bhow would you rate\b/i,
];

/** Incentivos: Google también prohíbe reseñas incentivadas. */
const FRASES_INCENTIVO = [
  /\bdescuento\b/i,
  /\bsorteo\b/i,
  /\bregal(o|amos|ito)\b/i,
  /\bcup(ó|o)n\b/i,
  /\ba cambio de\b/i,
  /\bpremio\b/i,
];

export interface ResultadoPolicy {
  ok: boolean;
  violaciones: string[];
}

export function lintCopyCaptacion(copy: string): ResultadoPolicy {
  const violaciones: string[] = [];
  if (FRASES_GATING.some((r) => r.test(copy))) {
    violaciones.push("Posible 'review gating' (condicionar/desviar según sentimiento).");
  }
  if (FRASES_INCENTIVO.some((r) => r.test(copy))) {
    violaciones.push("Posible reseña incentivada (Google prohíbe ofrecer algo a cambio).");
  }
  return { ok: violaciones.length === 0, violaciones };
}
