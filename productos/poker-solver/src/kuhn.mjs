/**
 * Kuhn poker — el patrón de calibración del motor.
 *
 * Kuhn es el juego de póker no trivial más chico que existe: 3 naipes (J, Q, K),
 * una carta por jugador, ante de 1, una sola apuesta de 1. Su equilibrio de Nash
 * está resuelto ANALÍTICAMENTE en la literatura desde 1950: el valor del juego
 * para el primer jugador es exactamente **-1/18**, y las estrategias de
 * equilibrio del segundo jugador son únicas.
 *
 * Por eso está acá: es la única forma honesta de saber si el motor CFR calcula
 * bien. Si el mismo código que va a resolver un river con 1300 combos no clava
 * -1/18 en Kuhn, entonces lo que devuelve en el river son decimales lindos sin
 * respaldo. Es el equivalente a calibrar una balanza con un peso patrón antes de
 * pesar mercadería.
 */

import { nodoDecision, nodoFold, nodoShowdown } from './cfr.mjs';

export const JOTA = 0;
export const REINA = 1;
export const REY = 2;
export const NOMBRES = ['J', 'Q', 'K'];

const N = 3;
const POTE = 2;      // los dos antes, dinero muerto
const APUESTA = 1;

/**
 * El "juego" que consume el motor. Kuhn tiene bloqueo trivial: si yo tengo la
 * reina, el rival no puede tenerla. Es el mismo mecanismo que el card removal
 * del river, en chiquito.
 */
export function juegoKuhn() {
  const pesos = [
    Float64Array.from([1, 1, 1]),
    Float64Array.from([1, 1, 1]),
  ];

  const masaNoBloqueada = (reachRival) => {
    const salida = new Float64Array(N);
    let total = 0;
    for (let o = 0; o < N; o++) total += reachRival[o];
    for (let h = 0; h < N; h++) salida[h] = total - reachRival[h];
    return salida;
  };

  const masaShowdown = (reachRival) => {
    const gana = new Float64Array(N);
    const pierde = new Float64Array(N);
    for (let h = 0; h < N; h++) {
      for (let o = 0; o < N; o++) {
        if (o === h) continue;          // no puede tener mi misma carta
        if (o < h) gana[h] += reachRival[o];
        else pierde[h] += reachRival[o];
      }
    }
    return { gana, pierde };
  };

  // Masa total de enfrentamientos posibles: 3 x 3 menos la diagonal = 6.
  const normalizador = 6;

  return { nCombos: [N, N], pesos, masaNoBloqueada, masaShowdown, normalizador };
}

/**
 * Árbol de Kuhn con la convención de utilidad del motor:
 *   ganar  = +(pote/2 + lo invertido por el rival en el subjuego)
 *   perder = -(pote/2 + lo invertido por uno mismo)
 * Con esa cuenta el juego queda de suma cero (el pote muerto no es de nadie),
 * que es lo que necesita CFR para que los regrets tengan sentido.
 */
export function arbolKuhn() {
  const mitad = POTE / 2;                 // 1
  const showdownSinApuesta = nodoShowdown(mitad);        // ±1
  const showdownConApuesta = nodoShowdown(mitad + APUESTA); // ±2

  // P0 pasó, P1 apostó → P0 decide
  const p0FrenteApuesta = nodoDecision(0, [
    { nombre: 'foldear', hijo: nodoFold(1, mitad) },
    { nombre: 'pagar', hijo: showdownConApuesta },
  ], N);

  // P0 pasó → P1 decide
  const p1TrasPaso = nodoDecision(1, [
    { nombre: 'pasar', hijo: showdownSinApuesta },
    { nombre: 'apostar', hijo: p0FrenteApuesta },
  ], N);

  // P0 apostó → P1 decide
  const p1FrenteApuesta = nodoDecision(1, [
    { nombre: 'foldear', hijo: nodoFold(0, mitad) },
    { nombre: 'pagar', hijo: showdownConApuesta },
  ], N);

  const raiz = nodoDecision(0, [
    { nombre: 'pasar', hijo: p1TrasPaso },
    { nombre: 'apostar', hijo: p1FrenteApuesta },
  ], N);

  return { raiz, p1TrasPaso, p0FrenteApuesta, p1FrenteApuesta };
}

/** El valor analítico publicado del juego para el primer jugador. */
export const VALOR_EXACTO_P0 = -1 / 18;
