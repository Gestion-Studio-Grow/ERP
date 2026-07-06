// Fantasma — motor de COGS por conversación.
// Es el núcleo del pricing por uso: mide el costo real de cada conversación en tokens de Claude Sonnet.

import type { UsoLLM } from "./tipos.js";

/** Tarifas de Claude Sonnet (`claude-sonnet-5`), US$ por millón de tokens. */
export const TARIFAS_SONNET = {
  inputUncachedPorMTok: 3.0,
  inputCachedPorMTok: 0.3, // prompt caching del guion de marca (0,1×)
  outputPorMTok: 15.0,
};

/** Costo en US$ de una sola llamada al LLM. */
export function costoLlamada(uso: UsoLLM): number {
  return (
    (uso.inputUncached / 1e6) * TARIFAS_SONNET.inputUncachedPorMTok +
    (uso.inputCached / 1e6) * TARIFAS_SONNET.inputCachedPorMTok +
    (uso.output / 1e6) * TARIFAS_SONNET.outputPorMTok
  );
}

export interface DesgloseCogs {
  turnos: number;
  inputUncachedTotal: number;
  inputCachedTotal: number;
  outputTotal: number;
  costoUsd: number;
}

/** Suma el COGS de una lista de usos (una conversación completa). */
export function desglosarCogs(usos: UsoLLM[]): DesgloseCogs {
  const acc: DesgloseCogs = {
    turnos: usos.length,
    inputUncachedTotal: 0,
    inputCachedTotal: 0,
    outputTotal: 0,
    costoUsd: 0,
  };
  for (const u of usos) {
    acc.inputUncachedTotal += u.inputUncached;
    acc.inputCachedTotal += u.inputCached;
    acc.outputTotal += u.output;
    acc.costoUsd += costoLlamada(u);
  }
  return acc;
}
