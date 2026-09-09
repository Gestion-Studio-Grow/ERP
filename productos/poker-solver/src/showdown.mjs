/**
 * Mesa de showdown del river: quién le gana a quién, descontando bloqueos.
 *
 * Es el único lugar donde el solver toca naipes de verdad. El motor CFR (cfr.mjs)
 * le pregunta a la mesa dos cosas, miles de veces por corrida:
 *   - `masaNoBloqueada`: cuánto reach del rival es COMPATIBLE con cada mano mía
 *     (card removal: si tengo el As de picas, el rival no puede tener AsKs).
 *   - `masaShowdown`: de ese reach compatible, cuánto le gano y cuánto me gana.
 *
 * Por qué no una matriz n×m: con rangos anchos son ~1300 × ~1300 = 1,7 M pares por
 * llamada, y las llamadas se cuentan de a miles. La técnica estándar de los solvers
 * es ordenar los combos del rival por fuerza una sola vez y, en cada llamada, hacer
 * sumas de prefijo sobre el reach: "todo lo que es más débil que yo" es un prefijo del
 * orden, y "lo que de ese prefijo comparte naipe conmigo" sale de un prefijo por naipe.
 * Queda O(m log m) de preparación y O(n + m) por llamada.
 *
 * Se exporta también la versión de fuerza bruta (doble loop) con la MISMA interfaz.
 * No es un fallback: es el oráculo contra el que se valida la rápida. Un error de
 * borde acá (un `<` que debía ser `<=`) produce estrategias verosímiles y equivocadas,
 * que es lo peor que le puede pasar a un solver.
 *
 * Combos que chocan con el board: el llamador normalmente construye los rangos con
 * el board como naipes muertos, así que no deberían llegar. Si llegan, se los TOLERA
 * sin romper el espacio de índices (el CFR indexa por posición en el rango): la mano
 * sigue ocupando su lugar pero no existe en esta mesa — como héroe recibe 0 en todo,
 * como rival nunca se lee su reach. Es lo coherente: una mano imposible no tiene
 * enfrentamientos.
 */

import { evaluar } from './evaluator.mjs';
import { comboIndex } from './range.mjs';

const N_NAIPES = 52;

/* ------------------------------------------------------------------ */
/* Validación de entradas — falla ruidoso, nunca silencioso            */
/* ------------------------------------------------------------------ */

function esNaipe(x) {
  return Number.isInteger(x) && x >= 0 && x < N_NAIPES;
}

function validarBoard(board) {
  if (!Array.isArray(board) || board.length !== 5) {
    throw new Error(`el board del river tiene 5 naipes, llegaron ${board?.length}`);
  }
  for (const c of board) if (!esNaipe(c)) throw new Error(`naipe inválido en el board: ${c}`);
  if (new Set(board).size !== 5) throw new Error('el board repite naipes');
}

/**
 * Un combo es [a, b] con a ≠ b. Se rechazan combos repetidos dentro de un mismo
 * jugador: el espacio de índices sería ambiguo y la corrección de "mano gemela"
 * (ver masaNoBloqueada) asume a lo sumo un gemelo por mano.
 */
function validarCombos(combos, etiqueta) {
  if (!Array.isArray(combos)) throw new Error(`combos de ${etiqueta}: se esperaba un array`);
  const vistos = new Set();
  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    if (!Array.isArray(combo) || combo.length !== 2) {
      throw new Error(`combo ${i} de ${etiqueta} no es un par de naipes`);
    }
    const [a, b] = combo;
    if (!esNaipe(a) || !esNaipe(b)) throw new Error(`combo ${i} de ${etiqueta}: naipe inválido`);
    if (a === b) throw new Error(`combo ${i} de ${etiqueta} repite el naipe ${a}`);
    const clave = comboIndex(a, b);
    if (vistos.has(clave)) throw new Error(`combo ${i} de ${etiqueta} está repetido en el rango`);
    vistos.add(clave);
  }
}

/* ------------------------------------------------------------------ */
/* Fuerza de cada combo — se evalúa UNA vez, en la construcción        */
/* ------------------------------------------------------------------ */

/**
 * Devuelve, para cada combo, su fuerza sobre el board (puntaje del evaluador) y si
 * es válido (no comparte naipe con el board). Los inválidos quedan con fuerza -1 y
 * NO se evalúan: pasarle al evaluador un naipe repetido daría un puntaje absurdo
 * (contaría el rango dos veces) sin tirar error.
 */
function fuerzasDe(combos, board) {
  const enBoard = new Uint8Array(N_NAIPES);
  for (const c of board) enBoard[c] = 1;

  const n = combos.length;
  const carta1 = new Int32Array(n);
  const carta2 = new Int32Array(n);
  const fuerza = new Int32Array(n);
  const valido = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const [a, b] = combos[i];
    carta1[i] = a;
    carta2[i] = b;
    if (enBoard[a] || enBoard[b]) {
      fuerza[i] = -1;
      continue;
    }
    fuerza[i] = evaluar([a, b, board[0], board[1], board[2], board[3], board[4]]);
    valido[i] = 1;
  }
  return { n, carta1, carta2, fuerza, valido };
}

/* ------------------------------------------------------------------ */
/* Búsquedas binarias sobre arrays ordenados ascendentes               */
/* ------------------------------------------------------------------ */

/** Primer índice en [desde, hasta) con arr[i] >= x (o `hasta` si no hay). */
function primerMayorOIgual(arr, x, desde, hasta) {
  let lo = desde, hi = hasta;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Primer índice en [desde, hasta) con arr[i] > x (o `hasta` si no hay). */
function primerMayor(arr, x, desde, hasta) {
  let lo = desde, hi = hasta;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/* ------------------------------------------------------------------ */
/* Preparación de una dirección (héroe fijo, rival fijo)               */
/* ------------------------------------------------------------------ */

/**
 * Todo lo que NO depende del reach se calcula acá, una vez por dirección.
 * Lo que sí depende del reach (los prefijos) se recalcula en cada llamada
 * sobre buffers reservados una sola vez, para no generar basura en el loop.
 */
function prepararDireccion(heroe, rival) {
  // 1. Combos válidos del rival, ordenados por fuerza ascendente.
  //    `orden[j]` = índice original del rival que ocupa la posición j.
  const ordenLista = [];
  for (let j = 0; j < rival.n; j++) if (rival.valido[j]) ordenLista.push(j);
  ordenLista.sort((x, y) => rival.fuerza[x] - rival.fuerza[y]);
  const orden = Int32Array.from(ordenLista);
  const m = orden.length;

  const fuerzaOrd = new Int32Array(m);
  for (let j = 0; j < m; j++) fuerzaOrd[j] = rival.fuerza[orden[j]];

  // 2. Por naipe, las POSICIONES (en el orden por fuerza) de los combos rivales que
  //    lo contienen, ascendentes. Formato CSR: las de `c` van en
  //    posiciones[inicioCarta[c] .. inicioCarta[c+1]). Total exacto: 2m entradas.
  const inicioCarta = new Int32Array(N_NAIPES + 1);
  for (let j = 0; j < m; j++) {
    inicioCarta[rival.carta1[orden[j]] + 1]++;
    inicioCarta[rival.carta2[orden[j]] + 1]++;
  }
  for (let c = 0; c < N_NAIPES; c++) inicioCarta[c + 1] += inicioCarta[c];

  const posiciones = new Int32Array(2 * m);
  const cursor = Int32Array.from(inicioCarta.subarray(0, N_NAIPES));
  // Recorrer j ascendente deja cada lista de posiciones ya ordenada.
  for (let j = 0; j < m; j++) {
    posiciones[cursor[rival.carta1[orden[j]]]++] = j;
    posiciones[cursor[rival.carta2[orden[j]]]++] = j;
  }

  // 3. Prefijos por naipe: para el naipe c hay (largo_c + 1) acumulados, con el 0
  //    adelante. Se guardan todos en un buffer plano; `offsetPref[c]` es donde arranca
  //    el del naipe c (= inicioCarta[c] + c, porque cada naipe suma un cero extra).
  const offsetPref = new Int32Array(N_NAIPES);
  for (let c = 0; c < N_NAIPES; c++) offsetPref[c] = inicioCarta[c] + c;
  const prefCarta = new Float64Array(2 * m + N_NAIPES);
  const pref = new Float64Array(m + 1);
  const porCarta = new Float64Array(N_NAIPES);

  // 4. Por cada mano del héroe: el intervalo semiabierto [lo, hi) de posiciones
  //    rivales con la MISMA fuerza (los empates), y cuántas posiciones de la lista
  //    de cada uno de sus dos naipes caen antes de lo / antes de hi. Con eso, en la
  //    llamada, la masa bloqueada de cada región sale de una resta de prefijos.
  //    Además el "gemelo": el índice rival con exactamente los mismos dos naipes.
  const gemeloDe = new Map();
  for (let j = 0; j < rival.n; j++) {
    if (rival.valido[j]) gemeloDe.set(comboIndex(rival.carta1[j], rival.carta2[j]), j);
  }

  const n = heroe.n;
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  const corteGana = new Int32Array(2 * n);   // [2h] naipe 1, [2h+1] naipe 2
  const cortePierde = new Int32Array(2 * n);
  const gemelo = new Int32Array(n).fill(-1);

  for (let h = 0; h < n; h++) {
    if (!heroe.valido[h]) continue;
    const f = heroe.fuerza[h];
    lo[h] = primerMayorOIgual(fuerzaOrd, f, 0, m);
    hi[h] = primerMayor(fuerzaOrd, f, 0, m);

    const c1 = heroe.carta1[h];
    const c2 = heroe.carta2[h];
    corteGana[2 * h] = primerMayorOIgual(posiciones, lo[h], inicioCarta[c1], inicioCarta[c1 + 1]) - inicioCarta[c1];
    corteGana[2 * h + 1] = primerMayorOIgual(posiciones, lo[h], inicioCarta[c2], inicioCarta[c2 + 1]) - inicioCarta[c2];
    cortePierde[2 * h] = primerMayorOIgual(posiciones, hi[h], inicioCarta[c1], inicioCarta[c1 + 1]) - inicioCarta[c1];
    cortePierde[2 * h + 1] = primerMayorOIgual(posiciones, hi[h], inicioCarta[c2], inicioCarta[c2 + 1]) - inicioCarta[c2];

    const g = gemeloDe.get(comboIndex(c1, c2));
    if (g !== undefined) gemelo[h] = g;
  }

  return {
    heroe, rival, orden, m, inicioCarta, posiciones, offsetPref,
    prefCarta, pref, porCarta, lo, hi, corteGana, cortePierde, gemelo,
  };
}

function validarReach(reach, d) {
  if (!(reach instanceof Float64Array) || reach.length !== d.rival.n) {
    throw new Error(`reach del rival: se esperaba Float64Array de largo ${d.rival.n}, llegó largo ${reach?.length}`);
  }
}

/* ------------------------------------------------------------------ */
/* Camino rápido                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<[number, number]>} combos0 manos del jugador 0
 * @param {Array<[number, number]>} combos1 manos del jugador 1
 * @param {number[]} board exactamente 5 naipes
 */
export function crearMesaShowdown(combos0, combos1, board) {
  validarBoard(board);
  validarCombos(combos0, 'jugador 0');
  validarCombos(combos1, 'jugador 1');

  const jugadores = [fuerzasDe(combos0, board), fuerzasDe(combos1, board)];
  const direcciones = [
    prepararDireccion(jugadores[0], jugadores[1]),
    prepararDireccion(jugadores[1], jugadores[0]),
  ];

  /**
   * Masa del reach rival que no comparte naipe con cada mano del héroe.
   *
   * total − (lo que tiene c1) − (lo que tiene c2) resta DOS veces al combo rival que
   * tiene c1 Y c2 — o sea, la mano gemela (los mismos dos naipes). Acá sí hay que
   * devolverla: esta cuenta abarca todas las fuerzas, incluida la del gemelo. Notar
   * el contraste con masaShowdown, donde la misma corrección NO corresponde.
   */
  function masaNoBloqueada(reachRival, hero) {
    const d = direcciones[hero];
    validarReach(reachRival, d);
    const { orden, m, rival, heroe, porCarta, gemelo } = d;

    porCarta.fill(0);
    let total = 0;
    for (let j = 0; j < m; j++) {
      const idx = orden[j];
      const r = reachRival[idx];
      total += r;
      porCarta[rival.carta1[idx]] += r;
      porCarta[rival.carta2[idx]] += r;
    }

    const salida = new Float64Array(heroe.n);
    for (let h = 0; h < heroe.n; h++) {
      if (!heroe.valido[h]) continue;
      let masa = total - porCarta[heroe.carta1[h]] - porCarta[heroe.carta2[h]];
      if (gemelo[h] >= 0) masa += reachRival[gemelo[h]];
      salida[h] = masa;
    }
    return salida;
  }

  /**
   * Para cada mano del héroe: masa rival compatible que le gana (`gana`) y que le
   * pierde (`pierde`). Los empates ([lo, hi) en el orden por fuerza) no entran en
   * ninguna de las dos.
   *
   * Sobre el doble descuento: al restar la masa bloqueada por c1 y por c2 dentro de
   * la región "más débil que yo" (posiciones < lo), un combo rival que tuviera c1 Y c2
   * se restaría dos veces. Pero el único combo con esos dos naipes es la mano gemela,
   * y sobre el mismo board tiene EXACTAMENTE mi fuerza (mismos 7 naipes → mismo
   * puntaje), así que su posición está en [lo, hi): nunca cae en < lo ni en >= hi.
   * Las regiones de gana y de pierde no contienen ningún combo doblemente bloqueado,
   * y por eso acá NO hay corrección que agregar. Agregarla sería un error.
   */
  function masaShowdown(reachRival, hero) {
    const d = direcciones[hero];
    validarReach(reachRival, d);
    const {
      orden, m, heroe, inicioCarta, posiciones, offsetPref,
      prefCarta, pref, lo, hi, corteGana, cortePierde,
    } = d;

    // Prefijo global sobre el orden por fuerza: pref[k] = reach de las posiciones < k.
    pref[0] = 0;
    for (let j = 0; j < m; j++) pref[j + 1] = pref[j] + reachRival[orden[j]];

    // Prefijo por naipe sobre su lista de posiciones (2m sumas en total).
    for (let c = 0; c < N_NAIPES; c++) {
      const base = offsetPref[c];
      let acc = 0;
      prefCarta[base] = 0;
      for (let k = inicioCarta[c], t = 1; k < inicioCarta[c + 1]; k++, t++) {
        acc += reachRival[orden[posiciones[k]]];
        prefCarta[base + t] = acc;
      }
    }

    const gana = new Float64Array(heroe.n);
    const pierde = new Float64Array(heroe.n);
    const totalRival = pref[m];

    for (let h = 0; h < heroe.n; h++) {
      if (!heroe.valido[h]) continue;
      const c1 = heroe.carta1[h];
      const c2 = heroe.carta2[h];
      const b1 = offsetPref[c1];
      const b2 = offsetPref[c2];
      const largo1 = inicioCarta[c1 + 1] - inicioCarta[c1];
      const largo2 = inicioCarta[c2 + 1] - inicioCarta[c2];

      // Región "más débil que yo": posiciones [0, lo).
      gana[h] = pref[lo[h]]
        - prefCarta[b1 + corteGana[2 * h]]
        - prefCarta[b2 + corteGana[2 * h + 1]];

      // Región "más fuerte que yo": posiciones [hi, m).
      pierde[h] = (totalRival - pref[hi[h]])
        - (prefCarta[b1 + largo1] - prefCarta[b1 + cortePierde[2 * h]])
        - (prefCarta[b2 + largo2] - prefCarta[b2 + cortePierde[2 * h + 1]]);
    }
    return { gana, pierde };
  }

  return { masaNoBloqueada, masaShowdown };
}

/* ------------------------------------------------------------------ */
/* Oráculo de fuerza bruta — lento, obvio, confiable                    */
/* ------------------------------------------------------------------ */

/**
 * Misma interfaz que `crearMesaShowdown`, implementada con el doble loop evidente.
 * Deliberadamente sin ninguna astucia: su valor es que se pueda leer y creer.
 * Un enfrentamiento existe si los 4 naipes de mano y los 5 del board son distintos.
 */
export function crearMesaShowdownFuerzaBruta(combos0, combos1, board) {
  validarBoard(board);
  validarCombos(combos0, 'jugador 0');
  validarCombos(combos1, 'jugador 1');

  const jugadores = [fuerzasDe(combos0, board), fuerzasDe(combos1, board)];

  function compatibles(heroe, h, rival, j) {
    if (!heroe.valido[h] || !rival.valido[j]) return false;
    const a1 = heroe.carta1[h], a2 = heroe.carta2[h];
    const b1 = rival.carta1[j], b2 = rival.carta2[j];
    return a1 !== b1 && a1 !== b2 && a2 !== b1 && a2 !== b2;
  }

  function masaNoBloqueada(reachRival, hero) {
    const heroe = jugadores[hero];
    const rival = jugadores[1 - hero];
    if (!(reachRival instanceof Float64Array) || reachRival.length !== rival.n) {
      throw new Error(`reach del rival: se esperaba Float64Array de largo ${rival.n}`);
    }
    const salida = new Float64Array(heroe.n);
    for (let h = 0; h < heroe.n; h++) {
      for (let j = 0; j < rival.n; j++) {
        if (compatibles(heroe, h, rival, j)) salida[h] += reachRival[j];
      }
    }
    return salida;
  }

  function masaShowdown(reachRival, hero) {
    const heroe = jugadores[hero];
    const rival = jugadores[1 - hero];
    if (!(reachRival instanceof Float64Array) || reachRival.length !== rival.n) {
      throw new Error(`reach del rival: se esperaba Float64Array de largo ${rival.n}`);
    }
    const gana = new Float64Array(heroe.n);
    const pierde = new Float64Array(heroe.n);
    for (let h = 0; h < heroe.n; h++) {
      for (let j = 0; j < rival.n; j++) {
        if (!compatibles(heroe, h, rival, j)) continue;
        if (heroe.fuerza[h] > rival.fuerza[j]) gana[h] += reachRival[j];
        else if (heroe.fuerza[h] < rival.fuerza[j]) pierde[h] += reachRival[j];
        // empate: no suma a ninguna
      }
    }
    return { gana, pierde };
  }

  return { masaNoBloqueada, masaShowdown };
}
