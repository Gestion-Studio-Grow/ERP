/**
 * Cartas y baraja — la base de todo lo demás.
 *
 * Representación: un naipe es un entero 0..51 → `(rank - 2) * 4 + suit`.
 * `rank` va de 2 a 14 (14 = As) y `suit` de 0 a 3 (c, d, h, s).
 * Entero y no objeto porque el solver de river precomputa una matriz de
 * 1326 × 1326 enfrentamientos: con enteros son índices y máscaras de bits,
 * con objetos serían 1,7 M de comparaciones de referencias.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const RANK_NAMES = {
  2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete',
  8: 'ocho', 9: 'nueve', 10: 'diez', 11: 'jota', 12: 'reina', 13: 'rey', 14: 'as',
};

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

/** @param {number[]} cards */
export const cardsToString = (cards) => cards.map(cardToString).join('');

export const FULL_DECK = Object.freeze(Array.from({ length: 52 }, (_, i) => i));

/** Máscara de 52 bits (BigInt no hace falta: usamos dos enteros de 32 no, usamos Number con bits en un Set). */
export function cardMask(cards) {
  let bajo = 0, alto = 0;
  for (const c of cards) {
    if (c < 26) bajo |= 1 << c;
    else alto |= 1 << (c - 26);
  }
  return { bajo, alto };
}

/** ¿Comparten al menos un naipe? Se usa para bloqueos (card removal). */
export function masksIntersect(a, b) {
  return (a.bajo & b.bajo) !== 0 || (a.alto & b.alto) !== 0;
}
