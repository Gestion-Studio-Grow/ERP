/**
 * Cartas y baraja — la base de todo lo demás.
 *
 * Representación: un naipe es un entero 0..51 → `(rank - 2) * 4 + suit`.
 * `rank` va de 2 a 14 (14 = As) y `suit` de 0 a 3 (c, d, h, s).
 *
 * Entero y no objeto porque el naipe se usa como ÍNDICE en los caminos calientes:
 * `showdown.mjs` arma sumas prefijas por naipe (52 posiciones) y el evaluador
 * indexa conteos por rango y por palo. Con objetos, cada acceso sería un deref y
 * cada comparación una llamada; con enteros es aritmética.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';


/** @param {number} rank 2..14 @param {number} suit 0..3 */
export function makeCard(rank, suit) {
  if (rank < 2 || rank > 14) throw new Error(`rango fuera de escala: ${rank}`);
  if (suit < 0 || suit > 3) throw new Error(`palo fuera de escala: ${suit}`);
  return (rank - 2) * 4 + suit;
}

/** @param {number} card */
export const rankOf = (card) => (card >> 2) + 2;
/** @param {number} card */
export const suitOf = (card) => card & 3;

/** "As" → entero. Acepta "as", "AS", "aS". */
export function parseCard(text) {
  if (typeof text !== 'string' || text.length !== 2) {
    throw new Error(`naipe inválido: ${JSON.stringify(text)}`);
  }
  const r = RANKS.indexOf(text[0].toUpperCase());
  const s = SUITS.indexOf(text[1].toLowerCase());
  if (r < 0) throw new Error(`rango desconocido en ${text}`);
  if (s < 0) throw new Error(`palo desconocido en ${text}`);
  return makeCard(r + 2, s);
}

/** "AsKd7h" o "As Kd 7h" → [enteros]. */
export function parseCards(text) {
  const limpio = text.replace(/[\s,]/g, '');
  if (limpio.length % 2 !== 0) throw new Error(`cadena de naipes impar: ${text}`);
  const salida = [];
  for (let i = 0; i < limpio.length; i += 2) salida.push(parseCard(limpio.slice(i, i + 2)));
  const vistos = new Set(salida);
  if (vistos.size !== salida.length) throw new Error(`naipes repetidos en ${text}`);
  return salida;
}

/** @param {number} card */
export function cardToString(card) {
  return RANKS[rankOf(card) - 2] + SUITS[suitOf(card)];
}


export const FULL_DECK = Object.freeze(Array.from({ length: 52 }, (_, i) => i));

