/**
 * Rangos: de la notación que escribe un jugador ("QQ+, AKs, A5s-A2s, 76s:0.5")
 * a la lista de combos con peso que consume el solver.
 *
 * Por qué importa el peso: los rangos reales no son binarios. Un jugador
 * 3-betea AJs el 40% de las veces y lo paga el 60%; si el solver toma el
 * rango como "sí/no" resuelve un juego que nadie juega.
 */

import { RANKS, makeCard, rankOf, suitOf, cardToString, parseCard } from './cards.mjs';

/** Índice canónico de un combo: 0..1325, independiente del orden de los naipes. */
export function comboIndex(a, b) {
  const [alto, bajo] = a > b ? [a, b] : [b, a];
  return (alto * (alto - 1)) / 2 + bajo;
}

const valorRango = (letra) => {
  const i = RANKS.indexOf(letra.toUpperCase());
  if (i < 0) throw new Error(`rango desconocido: ${letra}`);
  return i + 2;
};

function combosDePar(rango) {
  const salida = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = s1 + 1; s2 < 4; s2++) {
      salida.push([makeCard(rango, s1), makeCard(rango, s2)]);
    }
  }
  return salida;
}

function combosSuited(alto, bajo) {
  return [0, 1, 2, 3].map((s) => [makeCard(alto, s), makeCard(bajo, s)]);
}

function combosOffsuit(alto, bajo) {
  const salida = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (s1 !== s2) salida.push([makeCard(alto, s1), makeCard(bajo, s2)]);
    }
  }
  return salida;
}

/** Expande un token "de mano" (sin peso, sin rangos con guion). */
function expandirMano(token) {
  // Combo explícito: AsKh
  if (token.length === 4 && RANKS.includes(token[0].toUpperCase()) && 'cdhs'.includes(token[1].toLowerCase())) {
    return [[parseCard(token.slice(0, 2)), parseCard(token.slice(2))]];
  }

  const masMas = token.endsWith('+');
  const cuerpo = masMas ? token.slice(0, -1) : token;

  // Par: QQ
  if (cuerpo.length === 2 && cuerpo[0].toUpperCase() === cuerpo[1].toUpperCase()) {
    const r = valorRango(cuerpo[0]);
    const desde = masMas ? r : r;
    const hasta = masMas ? 14 : r;
    const salida = [];
    for (let x = desde; x <= hasta; x++) salida.push(...combosDePar(x));
    return salida;
  }

  // Con sufijo s/o, o sin sufijo (= ambos)
  let sufijo = '';
  let letras = cuerpo;
  const ultima = cuerpo[cuerpo.length - 1].toLowerCase();
  if (ultima === 's' || ultima === 'o') {
    // cuidado: "s" también es un palo, pero un token de 2 letras tipo "As"
    // ya se descartó arriba (tiene largo 2 y no es par) — lo tratamos como mano.
    sufijo = ultima;
    letras = cuerpo.slice(0, -1);
  }
  if (letras.length !== 2) throw new Error(`no entiendo la mano: ${token}`);

  let r1 = valorRango(letras[0]);
  let r2 = valorRango(letras[1]);
  if (r1 < r2) [r1, r2] = [r2, r1];
  if (r1 === r2) throw new Error(`par con sufijo no tiene sentido: ${token}`);

  const bajoDesde = masMas ? r2 : r2;
  const bajoHasta = masMas ? r1 - 1 : r2;

  const salida = [];
  for (let bajo = bajoDesde; bajo <= bajoHasta; bajo++) {
    if (sufijo === 's') salida.push(...combosSuited(r1, bajo));
    else if (sufijo === 'o') salida.push(...combosOffsuit(r1, bajo));
    else salida.push(...combosSuited(r1, bajo), ...combosOffsuit(r1, bajo));
  }
  return salida;
}

/** Expande "QQ-99" o "T9s-76s": mismo tipo de mano, recorriendo hacia abajo. */
function expandirGuion(token) {
  const [izq, der] = token.split('-').map((t) => t.trim());
  const sufijoIzq = /[so]$/i.test(izq) ? izq[izq.length - 1].toLowerCase() : '';
  const sufijoDer = /[so]$/i.test(der) ? der[der.length - 1].toLowerCase() : '';
  if (sufijoIzq !== sufijoDer) throw new Error(`el rango ${token} mezcla suited y offsuit`);

  const letrasIzq = sufijoIzq ? izq.slice(0, -1) : izq;
  const letrasDer = sufijoDer ? der.slice(0, -1) : der;

  const esPar = letrasIzq[0].toUpperCase() === letrasIzq[1].toUpperCase();
  const salida = [];

  if (esPar) {
    const a = valorRango(letrasIzq[0]);
    const b = valorRango(letrasDer[0]);
    const [desde, hasta] = a < b ? [a, b] : [b, a];
    for (let r = desde; r <= hasta; r++) salida.push(...combosDePar(r));
    return salida;
  }

  const altoIzq = Math.max(valorRango(letrasIzq[0]), valorRango(letrasIzq[1]));
  const bajoIzq = Math.min(valorRango(letrasIzq[0]), valorRango(letrasIzq[1]));
  const altoDer = Math.max(valorRango(letrasDer[0]), valorRango(letrasDer[1]));
  const bajoDer = Math.min(valorRango(letrasDer[0]), valorRango(letrasDer[1]));

  if (altoIzq - bajoIzq !== altoDer - bajoDer && altoIzq !== altoDer) {
    throw new Error(`el rango ${token} no es ni misma carta alta ni mismo gap`);
  }

  if (altoIzq === altoDer) {
    // A5s-A2s → fija el as, mueve la baja
    const [desde, hasta] = bajoIzq < bajoDer ? [bajoIzq, bajoDer] : [bajoDer, bajoIzq];
    for (let bajo = desde; bajo <= hasta; bajo++) {
      salida.push(...combosPorSufijo(altoIzq, bajo, sufijoIzq));
    }
    return salida;
  }

  // T9s-76s → mismo gap, baja de a un escalón
  const gap = altoIzq - bajoIzq;
  const [desde, hasta] = altoIzq < altoDer ? [altoIzq, altoDer] : [altoDer, altoIzq];
  for (let alto = desde; alto <= hasta; alto++) {
    salida.push(...combosPorSufijo(alto, alto - gap, sufijoIzq));
  }
  return salida;
}

function combosPorSufijo(alto, bajo, sufijo) {
  if (sufijo === 's') return combosSuited(alto, bajo);
  if (sufijo === 'o') return combosOffsuit(alto, bajo);
  return [...combosSuited(alto, bajo), ...combosOffsuit(alto, bajo)];
}

/**
 * Parsea un rango completo.
 * @param {string} texto p.ej. "QQ+, AKs, A5s-A2s, 76s:0.5, AhKh"
 * @param {number[]} [muertas] naipes ya visibles (board + descartes): sus combos se caen
 * @returns {{combos: Array<[number, number]>, pesos: Float64Array, indices: Int32Array}}
 */
export function parseRange(texto, muertas = []) {
  const bloqueadas = new Set(muertas);
  const pesoPorIndice = new Map();

  for (const bruto of texto.split(',')) {
    const token = bruto.trim();
    if (!token) continue;

    let peso = 1;
    let mano = token;
    const dosPuntos = token.indexOf(':');
    if (dosPuntos >= 0) {
      mano = token.slice(0, dosPuntos).trim();
      const crudo = token.slice(dosPuntos + 1).trim();
      // Se acepta fracción ("0.5") o porcentaje ("50%"): el jugador escribe
      // las dos formas y frenarlo por la sintaxis no aporta nada.
      const esPorcentaje = crudo.endsWith('%');
      const numero = Number(esPorcentaje ? crudo.slice(0, -1).trim() : crudo);
      peso = esPorcentaje ? numero / 100 : numero;
      if (!Number.isFinite(peso) || peso < 0 || peso > 1) {
        throw new Error(`peso inválido en ${token} (se espera 0..1 o 0%..100%)`);
      }
    }

    const combos = mano.includes('-') ? expandirGuion(mano) : expandirMano(mano);
    for (const [a, b] of combos) {
      if (bloqueadas.has(a) || bloqueadas.has(b)) continue;
      // último token gana: permite "AA, AA:0.5" para pisar un peso
      pesoPorIndice.set(comboIndex(a, b), { combo: [a, b], peso });
    }
  }

  const entradas = [...pesoPorIndice.entries()]
    .filter(([, v]) => v.peso > 0)
    .sort((x, y) => x[0] - y[0]);

  return {
    combos: entradas.map(([, v]) => v.combo),
    pesos: Float64Array.from(entradas.map(([, v]) => v.peso)),
    indices: Int32Array.from(entradas.map(([i]) => i)),
  };
}

/** Cuántas combinaciones (contando peso) tiene el rango. */
export function pesoTotal(rango) {
  let t = 0;
  for (const p of rango.pesos) t += p;
  return t;
}

export function rangeToString(rango) {
  return rango.combos.map(([a, b]) => cardToString(a) + cardToString(b)).join(' ');
}

export { rankOf, suitOf };
