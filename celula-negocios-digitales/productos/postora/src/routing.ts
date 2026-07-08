// Postora — MODEL ROUTING + motor de COGS.
//
// ESTE ES EL BLINDAJE DE UNIT ECONOMICS (no negociable, desde el día 1). El error clásico del
// "CM con IA" es cobrar flat por un agente sin límite y que un cliente pesado funda el margen.
// Antídoto en tres capas, todas implementadas acá o en planes.ts:
//   1) ROUTING por tarea: Haiku para lo barato y de volumen (ideación, variantes, hashtags),
//      Sonnet SOLO para el copy final en voz de marca (donde la calidad importa). Opus NUNCA
//      en el loop de producción (solo un tier premium podría justificarlo, fuera del MVP).
//   2) PROMPT CACHING del Kit de Marca (bloque grande y estable) → se paga 0,1× en cada llamada.
//   3) TOPE de posteos por ciclo (planes.ts) + tope de tokens por generación (kill-switch).
//
// Tarifas oficiales de Claude (US$ por millón de tokens), lectura cacheada = 0,1× del input:
//   Haiku 4.5  (claude-haiku-4-5): in 1  · out 5   · cache 0,10
//   Sonnet 5   (claude-sonnet-5):  in 3  · out 15  · cache 0,30
//   Opus 4.8   (claude-opus-4-8):  in 5  · out 25  · cache 0,50

import type { ModeloClaude, UsoLLM } from "./tipos.ts";

export interface Tarifa {
  inputPorMTok: number;
  outputPorMTok: number;
  cachePorMTok: number; // lectura cacheada (0,1× del input)
}

export const TARIFAS: Record<ModeloClaude, Tarifa> = {
  haiku: { inputPorMTok: 1.0, outputPorMTok: 5.0, cachePorMTok: 0.1 },
  sonnet: { inputPorMTok: 3.0, outputPorMTok: 15.0, cachePorMTok: 0.3 },
  opus: { inputPorMTok: 5.0, outputPorMTok: 25.0, cachePorMTok: 0.5 },
};

/**
 * ROUTING: qué modelo atiende cada paso de la fábrica de contenido.
 * - ideación / variantes / hashtags → Haiku (barato, alto volumen).
 * - copy final en voz de marca       → Sonnet (calidad donde se ve).
 * El copy es lo único que toca Sonnet; todo lo demás es Haiku. Eso mantiene el COGS por posteo
 * en centavos incluso con revisiones.
 */
export const ROUTING = {
  ideacion: "haiku",
  hashtags: "haiku",
  copyFinal: "sonnet",
} as const satisfies Record<string, ModeloClaude>;

/** Costo en US$ de una sola llamada al LLM, según su modelo y uso de tokens. */
export function costoLlamada(uso: UsoLLM): number {
  const t = TARIFAS[uso.modelo];
  return (
    (uso.inputUncached / 1e6) * t.inputPorMTok +
    (uso.inputCached / 1e6) * t.cachePorMTok +
    (uso.output / 1e6) * t.outputPorMTok
  );
}

export interface DesgloseCogs {
  llamadas: number;
  porModelo: Record<ModeloClaude, number>; // US$ por modelo
  costoUsd: number;
}

/** Suma el COGS de una lista de usos (ej. todos los posteos de un plan). */
export function desglosarCogs(usos: UsoLLM[]): DesgloseCogs {
  const acc: DesgloseCogs = {
    llamadas: usos.length,
    porModelo: { haiku: 0, sonnet: 0, opus: 0 },
    costoUsd: 0,
  };
  for (const u of usos) {
    const c = costoLlamada(u);
    acc.porModelo[u.modelo] += c;
    acc.costoUsd += c;
  }
  return acc;
}

// ── Kill-switch de margen por generación ─────────────────────────────────────
// Tope duro de tokens de salida por llamada. Si una generación se dispara (loop, brief raro),
// se corta y se marca para revisión humana en vez de quemar tokens. Cota superior al COGS/post.
export const TOPE_OUTPUT_TOKENS_POR_LLAMADA = 600;

/** Costo estimado de una imagen generada por IA (add-on medido, NO incluido en el flat). */
// La generación de imagen es el driver de COGS más peligroso: por eso en el MVP el default es
// plantilla brandeada (COGS ~0) y la imagen IA se cobra por CRÉDITO, con markup sobre este costo.
export const COSTO_IMAGEN_IA_USD = 0.05;
