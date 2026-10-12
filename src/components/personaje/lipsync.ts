// ============================================================================
// Lip sync estilo sprite-swap: la lógica pura (sin React, sin navegador).
// ============================================================================
//
// La técnica viene de Seidorito (proyecto sap-activate-copiloto, deploy `seidorito-console` en Vercel)
// y es la misma de Azi (Factory-GSG/agencia-turismo/video/personaje/BOCETOS.md): el personaje tiene
// un dibujo de boca por cada forma de Rhubarb Lip Sync y el player cambia de dibujo según el tiempo.
//
// Formas de Rhubarb (https://github.com/DanielSWolf/rhubarb-lip-sync):
//   A  labios cerrados (P, B, M)        B  apenas abierta (casi todas las consonantes)
//   C  abierta (EH, AE)                 D  bien abierta (AA)
//   E  redondeada (AO, ER)              F  fruncida (UW, OW, W)
//   G  dientes sobre el labio (F, V)    H  lengua arriba (L)
//   X  reposo (silencio)
//
// Tres capas de voz, en orden de preferencia (las decide el player):
//   1. audio real + visemas de Rhubarb  → `bocaEn(cues, t)`
//   2. voz del navegador (speechSynthesis), que no informa visemas → `bocaGenerica(t)`
//   3. modo lectura, sin voz → `bocaGenerica(t)` durante `duracionLectura(texto)`

export const BOCAS = ["A", "B", "C", "D", "E", "F", "G", "H", "X"] as const;
export type Boca = (typeof BOCAS)[number];

export type CueRhubarb = { start: number; end: number; value: Boca };
export type VisemasRhubarb = { metadata?: { duration?: number }; mouthCues: CueRhubarb[] };

function esBoca(v: unknown): v is Boca {
  return typeof v === "string" && (BOCAS as readonly string[]).includes(v);
}

/** Normaliza el JSON que escupe `rhubarb -f json`: descarta lo inválido y ordena por inicio. */
export function parsearVisemas(json: unknown): CueRhubarb[] {
  const cues = (json as { mouthCues?: unknown } | null)?.mouthCues;
  if (!Array.isArray(cues)) return [];
  return cues
    .filter(
      (c): c is CueRhubarb =>
        typeof c === "object" &&
        c !== null &&
        Number.isFinite((c as CueRhubarb).start) &&
        Number.isFinite((c as CueRhubarb).end) &&
        (c as CueRhubarb).end > (c as CueRhubarb).start &&
        esBoca((c as CueRhubarb).value),
    )
    .map((c) => ({ start: c.start, end: c.end, value: c.value }))
    .sort((a, b) => a.start - b.start);
}

/** La boca que corresponde al segundo `t` del audio. Fuera de todo cue: reposo. */
export function bocaEn(cues: readonly CueRhubarb[], t: number): Boca {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c.value;
  }
  return "X";
}

// Respaldo cuando no hay JSON de Rhubarb: un ciclo que se lee como habla (abre, cierra, redondea)
// sin repetir la misma forma dos veces seguidas. Mismo nombre que en el player original.
export const PATRON_GENERICO: readonly Boca[] = ["B", "C", "E", "B", "D", "C", "A", "F", "C", "B", "H", "E", "G", "C"];

/** Boca del patrón genérico para el segundo `t`; `paso` = segundos por forma (≈ una sílaba). */
export function bocaGenerica(t: number, paso = 0.09): Boca {
  if (!(t >= 0) || !(paso > 0)) return "X";
  return PATRON_GENERICO[Math.floor(t / paso) % PATRON_GENERICO.length];
}

/** Milisegundos que dura una escena en modo lectura: proporcional a las palabras, con piso. */
export function duracionLectura(texto: string, palabrasPorSegundo = 2.6): number {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2200, Math.round((palabras / palabrasPorSegundo) * 1000));
}

/**
 * Con audio real hay una sola pista para todo el guion: el subtítulo se reparte en proporción al
 * largo de cada escena. Devuelve el índice de la escena que se está diciendo en el segundo `t`.
 */
export function escenaEnTiempo(textos: readonly string[], duracion: number, t: number): number {
  if (textos.length === 0) return -1;
  if (!(duracion > 0) || !(t > 0)) return 0;
  const pesos = textos.map((x) => Math.max(1, x.length));
  const total = pesos.reduce((a, b) => a + b, 0);
  let acumulado = 0;
  for (let i = 0; i < pesos.length; i++) {
    acumulado += (pesos[i] / total) * duracion;
    if (t < acumulado) return i;
  }
  return textos.length - 1;
}

type VozMinima = { lang: string; name: string; localService?: boolean };

/** Voz preferida: castellano rioplatense, después cualquier castellano; local antes que remota. */
export function elegirVoz<V extends VozMinima>(voces: readonly V[]): V | null {
  const puntaje = (v: V) => {
    const lang = v.lang.toLowerCase().replace("_", "-");
    const base = lang === "es-ar" ? 3 : lang === "es-419" || lang === "es-us" || lang === "es-mx" ? 2 : lang.startsWith("es") ? 1 : 0;
    return base === 0 ? 0 : base * 2 + (v.localService ? 1 : 0);
  };
  let mejor: V | null = null;
  for (const v of voces) if (puntaje(v) > 0 && (!mejor || puntaje(v) > puntaje(mejor))) mejor = v;
  return mejor;
}
