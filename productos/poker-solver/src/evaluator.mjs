/**
 * Evaluador de manos de 5 a 7 naipes.
 *
 * Devuelve un ENTERO comparable: mano mejor ⇒ número mayor. No devuelve
 * "categoría + kickers" como objeto porque el solver compara millones de
 * pares: un `>` entre enteros es una instrucción de CPU, un objeto es una
 * cadena de derefs.
 *
 * Codificación: `categoria * 15^5 + k1*15^4 + k2*15^3 + k3*15^2 + k4*15 + k5`
 * con rangos 2..14, así que cada dígito entra en base 15 y el máximo
 * (8 * 759375 + ...) queda muy por debajo de 2^31 → aritmética entera de 32 bits.
 */

import { rankOf, suitOf } from './cards.mjs';

export const CATEGORIA = Object.freeze({
  CARTA_ALTA: 0,
  PAR: 1,
  DOBLE_PAR: 2,
  TRIO: 3,
  ESCALERA: 4,
  COLOR: 5,
  FULL: 6,
  POKER: 7,
  ESCALERA_COLOR: 8,
});

export const NOMBRE_CATEGORIA = Object.freeze([
  'carta alta', 'par', 'doble par', 'trío', 'escalera',
  'color', 'full', 'póker', 'escalera de color',
]);

const BASE = 15;
const P = [BASE ** 5, BASE ** 4, BASE ** 3, BASE ** 2, BASE, 1];

function componer(categoria, kickers) {
  let valor = categoria * P[0];
  for (let i = 0; i < kickers.length; i++) valor += kickers[i] * P[i + 1];
  return valor;
}

/** Decodifica un puntaje a algo legible (para explicar al jugador, no para el motor). */
export function describirPuntaje(puntaje) {
  const categoria = Math.floor(puntaje / P[0]);
  return NOMBRE_CATEGORIA[categoria];
}

export function categoriaDe(puntaje) {
  return Math.floor(puntaje / P[0]);
}

/**
 * Rango más alto de una escalera contenida en la máscara de rangos, o 0.
 * La rueda (A-2-3-4-5) devuelve 5: el as juega bajo y la escalera es la peor.
 */
function escaleraAlta(mascara) {
  for (let alto = 14; alto >= 6; alto--) {
    let completa = true;
    for (let d = 0; d < 5; d++) {
      if ((mascara & (1 << (alto - d))) === 0) { completa = false; break; }
    }
    if (completa) return alto;
  }
  // rueda: 5-4-3-2-A
  const rueda = (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2) | (1 << 14);
  if ((mascara & rueda) === rueda) return 5;
  return 0;
}

/** Los `n` rangos más altos presentes en la máscara, de mayor a menor. */
function rangosAltos(mascara, n, excluir = 0) {
  const salida = [];
  for (let r = 14; r >= 2 && salida.length < n; r--) {
    if (r === excluir) continue;
    if (mascara & (1 << r)) salida.push(r);
  }
  return salida;
}

/**
 * Evalúa 5, 6 o 7 naipes y devuelve el puntaje de la MEJOR mano de 5.
 * @param {number[]} naipes enteros 0..51
 */
export function evaluar(naipes) {
  if (naipes.length < 5 || naipes.length > 7) {
    throw new Error(`el evaluador acepta 5..7 naipes, recibió ${naipes.length}`);
  }

  const conteoRango = new Array(15).fill(0);
  const conteoPalo = [0, 0, 0, 0];
  const rangosPorPalo = [0, 0, 0, 0];
  let mascaraRangos = 0;

  for (const naipe of naipes) {
    const r = rankOf(naipe);
    const s = suitOf(naipe);
    conteoRango[r]++;
    conteoPalo[s]++;
    rangosPorPalo[s] |= 1 << r;
    mascaraRangos |= 1 << r;
  }

  // Palo de color (si hay). Con 7 naipes puede haber a lo sumo uno.
  let paloColor = -1;
  for (let s = 0; s < 4; s++) if (conteoPalo[s] >= 5) paloColor = s;

  // 8 — escalera de color: se chequea primero porque le gana a todo.
  if (paloColor >= 0) {
    const alta = escaleraAlta(rangosPorPalo[paloColor]);
    if (alta) return componer(CATEGORIA.ESCALERA_COLOR, [alta]);
  }

  // Inventario de repeticiones, de rango alto a bajo.
  const pokers = [], trios = [], pares = [];
  for (let r = 14; r >= 2; r--) {
    if (conteoRango[r] === 4) pokers.push(r);
    else if (conteoRango[r] === 3) trios.push(r);
    else if (conteoRango[r] === 2) pares.push(r);
  }

  // 7 — póker
  if (pokers.length) {
    const cuadra = pokers[0];
    const [kicker] = rangosAltos(mascaraRangos, 1, cuadra);
    return componer(CATEGORIA.POKER, [cuadra, kicker]);
  }

  // 6 — full (trío + par, o dos tríos usando el segundo como par)
  if (trios.length >= 2) return componer(CATEGORIA.FULL, [trios[0], trios[1]]);
  if (trios.length === 1 && pares.length >= 1) {
    return componer(CATEGORIA.FULL, [trios[0], pares[0]]);
  }

  // 5 — color
  if (paloColor >= 0) {
    return componer(CATEGORIA.COLOR, rangosAltos(rangosPorPalo[paloColor], 5));
  }

  // 4 — escalera
  const escalera = escaleraAlta(mascaraRangos);
  if (escalera) return componer(CATEGORIA.ESCALERA, [escalera]);

  // 3 — trío
  if (trios.length === 1) {
    return componer(CATEGORIA.TRIO, [trios[0], ...rangosAltos(mascaraRangos, 2, trios[0])]);
  }

  // 2 — doble par
  if (pares.length >= 2) {
    const [alto, bajo] = pares;
    let kicker = 0;
    for (let r = 14; r >= 2; r--) {
      if (r === alto || r === bajo) continue;
      if (mascaraRangos & (1 << r)) { kicker = r; break; }
    }
    return componer(CATEGORIA.DOBLE_PAR, [alto, bajo, kicker]);
  }

  // 1 — par
  if (pares.length === 1) {
    return componer(CATEGORIA.PAR, [pares[0], ...rangosAltos(mascaraRangos, 3, pares[0])]);
  }

  // 0 — carta alta
  return componer(CATEGORIA.CARTA_ALTA, rangosAltos(mascaraRangos, 5));
}
