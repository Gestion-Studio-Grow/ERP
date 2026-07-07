/**
 * Detección de temas sensibles.
 *
 * Si una reseña toca alguna de estas categorías, se ESCALA a humano sin importar las
 * estrellas (incluso un 5★ que mencione algo delicado). Nunca se autopublica una respuesta
 * a un tema sensible: el costo de equivocarse en público (legal/reputacional) es demasiado alto.
 *
 * Es un primer filtro barato (keywords) — deliberadamente sesgado a falsos positivos:
 * preferimos escalar de más y que un humano descarte, que publicar algo delicado solo.
 */
import type { CategoriaSensible } from "./types.js";

const PATRONES: Record<CategoriaSensible, RegExp[]> = {
  legal: [
    /\babogad[oa]s?\b/i,
    /\bdemand(a|ar|o|é)\b/i,
    /\bjuicio\b/i,
    /\bden(u|ú)nci/i,
    /\blegal(es)?\b/i,
    /\bdefensa del consumidor\b/i,
    /\blawyer\b/i,
    /\bsue\b/i,
    /\blawsuit\b/i,
  ],
  salud_seguridad: [
    /\bintoxica/i,
    /\bhospital/i,
    /\bemergencia/i,
    /\balergi/i,
    /\bme enferm/i,
    /\bherid[oa]/i,
    /\blesi(ó|o)n/i,
    /\bquemadura/i,
    /\bins?ecto|cucaracha|rata|pelo en\b/i,
    /\bfood poison/i,
    /\bunsafe\b/i,
  ],
  discriminacion: [
    /\bdiscrimin/i,
    /\bracis/i,
    /\bxenof/i,
    /\bhomof/i,
    /\bmachist/i,
    /\bmaltrat/i,
    /\bhumill/i,
  ],
  fraude_robo: [
    /\bestaf/i,
    /\bfraud/i,
    /\brob(o|aron|é|arme)\b/i,
    /\bme cobraron de m(á|a)s\b/i,
    /\bchoreo\b/i,
    /\bscam\b/i,
    /\bstole\b/i,
  ],
  datos_personales: [
    /\bmis datos\b/i,
    /\btarjeta de cr(é|e)dito\b/i,
    /\bfiltr(a|aron) mis\b/i,
    /\bdata breach\b/i,
    /\bhacke/i,
  ],
  menores: [/\bmenor(es)?\b/i, /\bmi hij[oa]\b.*\b(a(ñ|n)os?)\b/i, /\bchic[oa] de \d+ a(ñ|n)os\b/i],
  fallecimiento: [/\bfalleci/i, /\bmuri(ó|o)\b/i, /\bmuerte\b/i, /\bdied\b/i],
};

/**
 * Devuelve la primera categoría sensible detectada, o undefined si la reseña es "normal".
 */
export function detectarSensible(texto: string): CategoriaSensible | undefined {
  for (const [categoria, patrones] of Object.entries(PATRONES) as [
    CategoriaSensible,
    RegExp[],
  ][]) {
    if (patrones.some((p) => p.test(texto))) return categoria;
  }
  return undefined;
}
