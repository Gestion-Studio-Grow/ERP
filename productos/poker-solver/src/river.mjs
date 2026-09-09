/**
 * Solver EXACTO de subjuego de river.
 *
 * Por qué river y no "un solver postflop completo": en el river ya no vienen más
 * cartas. No hay que abstraer nada — ni buckets de manos, ni equity futura, ni
 * muestreo de turns. El subjuego es un juego de información imperfecta FINITO y
 * chico, y CFR+ lo resuelve al equilibrio con rangos completos, sin error de
 * abstracción. Es el único pedazo del árbol de póker donde un estudio chico
 * puede dar un número que NO es peor que el de PioSOLVER: es el mismo número.
 *
 * Lo que este módulo NO hace, y hay que decirlo: no resuelve flop ni turn. Ahí sí
 * aparecen la abstracción de cartas y el árbol de 3 calles, que es donde viven
 * los años de ingeniería en C++/CUDA de los productos comerciales.
 */

import { parseCards, rankOf, suitOf, RANKS } from './cards.mjs';
import { parseRange } from './range.mjs';
import { evaluar, describirPuntaje } from './evaluator.mjs';
import { crearMesaShowdown } from './showdown.mjs';
import { nodoDecision, nodoFold, nodoShowdown, resolver, estrategiaPromedio } from './cfr.mjs';

export const OOP = 0; // fuera de posición: habla primero
export const IP = 1;  // en posición: habla último

/** Redondeo a fichas enteras: los solvers que reparten centavos inventan precisión. */
const aFichas = (x) => Math.round(x * 100) / 100;

/**
 * Construye el árbol de apuestas de una calle.
 *
 * @param {object} cfg
 * @param {number} cfg.pote pote al empezar el river (dinero muerto)
 * @param {number} cfg.stack stack efectivo de cada jugador
 * @param {number[]} cfg.tamanosApuesta fracciones del pote para la primera apuesta
 * @param {number[]} cfg.tamanosSubida fracciones del pote para las subidas
 * @param {number} cfg.maxSubidas cuántas subidas se permiten (0 = apuesta y listo)
 * @param {number[]} cfg.nCombos [n0, n1]
 */
export function construirArbolRiver(cfg) {
  const { pote, stack, tamanosApuesta, tamanosSubida, maxSubidas, nCombos } = cfg;
  const mitad = pote / 2;
  const nodos = { decisiones: [] };

  /**
   * @param {number} turno jugador que habla
   * @param {number[]} inv invertido en el river por cada jugador
   * @param {number} pasosSeguidos cuántos "pasar" consecutivos hubo
   * @param {number} subidasUsadas
   */
  function construir(turno, inv, pasosSeguidos, subidasUsadas, etiqueta) {
    const rival = 1 - turno;
    const aPagar = aFichas(inv[rival] - inv[turno]);
    const stackLibre = aFichas(stack - inv[turno]);
    const poteActual = aFichas(pote + inv[0] + inv[1]);
    const acciones = [];

    if (aPagar <= 0) {
      // Nadie apostó todavía en este punto.
      if (pasosSeguidos === 1) {
        // Segundo pase consecutivo → showdown sin apuesta.
        acciones.push({ nombre: 'pasar', hijo: nodoShowdown(aFichas(mitad + inv[turno])) });
      } else {
        acciones.push({
          nombre: 'pasar',
          hijo: construir(rival, inv, 1, subidasUsadas, `${etiqueta}p`),
        });
      }
      for (const monto of montosValidos(tamanosApuesta, poteActual, stackLibre, 0)) {
        const nuevo = [...inv];
        nuevo[turno] = aFichas(inv[turno] + monto);
        acciones.push({
          nombre: nombreApuesta('apostar', monto, poteActual, stackLibre),
          hijo: construir(rival, nuevo, 0, subidasUsadas, `${etiqueta}a${monto}`),
        });
      }
    } else {
      // Hay una apuesta en la mesa: foldear, pagar, o subir.
      acciones.push({
        nombre: 'foldear',
        hijo: nodoFold(rival, aFichas(mitad + inv[turno])),
      });

      const pago = Math.min(aPagar, stackLibre);
      const invPago = [...inv];
      invPago[turno] = aFichas(inv[turno] + pago);
      acciones.push({
        nombre: 'pagar',
        hijo: nodoShowdown(aFichas(mitad + Math.min(invPago[0], invPago[1]))),
      });

      if (subidasUsadas < maxSubidas && stackLibre > aPagar) {
        for (const monto of montosValidos(tamanosSubida, poteActual, stackLibre, aPagar)) {
          const nuevo = [...inv];
          nuevo[turno] = aFichas(inv[turno] + monto);
          acciones.push({
            nombre: nombreApuesta('subir', monto, poteActual, stackLibre),
            hijo: construir(rival, nuevo, 0, subidasUsadas + 1, `${etiqueta}s${monto}`),
          });
        }
      }
    }

    const nodo = nodoDecision(turno, acciones, nCombos[turno]);
    nodo.etiqueta = etiqueta || 'raiz';
    nodo.aPagar = aPagar;
    nodos.decisiones.push(nodo);
    return nodo;
  }

  const raiz = construir(OOP, [0, 0], 0, 0, '');
  return { raiz, decisiones: nodos.decisiones };
}

/**
 * Traduce fracciones de pote a montos de ficha, sin duplicados y sin apuestas
 * imposibles. El all-in entra una sola vez incluso si dos fracciones lo pisan:
 * un árbol con dos ramas idénticas no es más preciso, es más lento.
 */
function montosValidos(fracciones, poteActual, stackLibre, aPagar) {
  const vistos = new Set();
  const salida = [];
  for (const f of fracciones) {
    // Al subir, el monto total puesto = pago + subida sobre el pote resultante.
    const bruto = aFichas(aPagar + f * (poteActual + aPagar));
    const monto = Math.min(bruto, stackLibre);
    if (monto <= aPagar + 1e-9) continue;      // no llega ni a subir
    const clave = monto.toFixed(2);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(monto);
  }
  // El all-in se ofrece siempre que haya AL MENOS un tamaño configurado: un árbol
  // de river sin la opción de jugarse el stack no representa el juego. Pero si el
  // que llama pasó la lista vacía a propósito (para armar un check-down), se
  // respeta: un solver que agrega ramas que nadie pidió miente sobre lo que resolvió.
  const clave = stackLibre.toFixed(2);
  if (fracciones.length > 0 && stackLibre > aPagar + 1e-9 && !vistos.has(clave)) {
    vistos.add(clave);
    salida.push(stackLibre);
  }
  return salida.sort((a, b) => a - b);
}

function nombreApuesta(verbo, monto, poteActual, stackLibre) {
  if (Math.abs(monto - stackLibre) < 1e-9) return `${verbo} all-in (${monto})`;
  const pct = Math.round((monto / poteActual) * 100);
  return `${verbo} ${monto} (${pct}% pote)`;
}

/**
 * Arma y resuelve un spot de river completo.
 *
 * @param {object} spot
 * @param {string} spot.board 5 naipes, p.ej. "Ah7d2c9sKh"
 * @param {string} spot.rangoOOP notación de rango
 * @param {string} spot.rangoIP notación de rango
 * @param {number} spot.pote
 * @param {number} spot.stack stack efectivo por jugador
 * @param {number[]} [spot.tamanosApuesta]
 * @param {number[]} [spot.tamanosSubida]
 * @param {number} [spot.maxSubidas]
 * @param {number} [spot.iteraciones]
 */
export function resolverRiver(spot) {
  const board = parseCards(spot.board);
  if (board.length !== 5) throw new Error(`el river necesita 5 naipes, vinieron ${board.length}`);

  const rangoOOP = parseRange(spot.rangoOOP, board);
  const rangoIP = parseRange(spot.rangoIP, board);
  if (!rangoOOP.combos.length || !rangoIP.combos.length) {
    throw new Error('algún rango quedó vacío después de sacar las cartas del board');
  }

  const mesa = crearMesaShowdown(rangoOOP.combos, rangoIP.combos, board);

  // Masa total de enfrentamientos legales: es el divisor de todo EV que
  // reportemos. Sin esto los números salen en "unidades de rango", que no
  // significan nada para el jugador.
  const noBloqueadaOOP = mesa.masaNoBloqueada(rangoIP.pesos, OOP);
  let normalizador = 0;
  for (let h = 0; h < rangoOOP.combos.length; h++) {
    normalizador += rangoOOP.pesos[h] * noBloqueadaOOP[h];
  }

  const juego = {
    nCombos: [rangoOOP.combos.length, rangoIP.combos.length],
    pesos: [rangoOOP.pesos, rangoIP.pesos],
    masaNoBloqueada: mesa.masaNoBloqueada,
    masaShowdown: mesa.masaShowdown,
    normalizador,
  };

  const arbol = construirArbolRiver({
    pote: spot.pote,
    stack: spot.stack,
    tamanosApuesta: spot.tamanosApuesta ?? [0.33, 0.75, 1.25],
    tamanosSubida: spot.tamanosSubida ?? [1.0],
    maxSubidas: spot.maxSubidas ?? 1,
    nCombos: juego.nCombos,
  });

  const salida = resolver(arbol.raiz, juego, {
    iteraciones: spot.iteraciones ?? 600,
    cada: spot.cada,
  });

  return {
    ...salida,
    arbol,
    juego,
    board,
    rangos: { [OOP]: rangoOOP, [IP]: rangoIP },
    pote: spot.pote,
    // La explotabilidad relativa es la cifra honesta: "este solver deja sobre la
    // mesa un X% del pote". El umbral de ~0,3% para considerarlo resuelto es
    // criterio PROPIO de GSG para "sirve para estudiar" — no es una convención
    // citable de la industria, así que no se presenta como tal.
    explotabilidadPorcentualDelPote: (salida.explotabilidad / spot.pote) * 100,
  };
}

/** Clase de mano legible: "AKs", "77", "T9o". Sirve para agrupar el reporte. */
export function claseDeMano(combo) {
  const [a, b] = combo;
  const r1 = Math.max(rankOf(a), rankOf(b));
  const r2 = Math.min(rankOf(a), rankOf(b));
  const l1 = RANKS[r1 - 2];
  const l2 = RANKS[r2 - 2];
  if (r1 === r2) return l1 + l2;
  return l1 + l2 + (suitOf(a) === suitOf(b) ? 's' : 'o');
}

/**
 * Reporte legible de un nodo: qué hace cada mano y con qué frecuencia, agrupado
 * por clase de mano y ordenado por fuerza. Es lo que un jugador puede estudiar;
 * el Float64Array crudo no le sirve a nadie.
 */
export function reporteNodo(solucion, nodo, opciones = {}) {
  const jugador = nodo.jugador;
  const rango = solucion.rangos[jugador];
  const sigma = estrategiaPromedio(nodo);
  const porClase = new Map();

  for (let h = 0; h < rango.combos.length; h++) {
    const clase = claseDeMano(rango.combos[h]);
    if (!porClase.has(clase)) {
      porClase.set(clase, {
        clase,
        peso: 0,
        fuerza: evaluar([...rango.combos[h], ...solucion.board]),
        frecuencias: new Float64Array(nodo.acciones.length),
      });
    }
    const fila = porClase.get(clase);
    const w = rango.pesos[h];
    fila.peso += w;
    for (let a = 0; a < nodo.acciones.length; a++) fila.frecuencias[a] += w * sigma[a][h];
  }

  const filas = [...porClase.values()].map((f) => ({
    clase: f.clase,
    peso: f.peso,
    mano: describirPuntaje(f.fuerza),
    fuerza: f.fuerza,
    frecuencias: Array.from(f.frecuencias, (x) => x / f.peso),
  }));

  filas.sort((x, y) => y.fuerza - x.fuerza);
  return {
    jugador,
    etiqueta: nodo.etiqueta,
    acciones: nodo.acciones.map((a) => a.nombre),
    filas: opciones.limite ? filas.slice(0, opciones.limite) : filas,
  };
}

/** Frecuencia agregada de cada acción en un nodo, ponderada por el rango. */
export function frecuenciasAgregadas(solucion, nodo) {
  const rango = solucion.rangos[nodo.jugador];
  const sigma = estrategiaPromedio(nodo);
  const total = rango.pesos.reduce((a, b) => a + b, 0);
  return nodo.acciones.map((accion, a) => {
    let acc = 0;
    for (let h = 0; h < rango.combos.length; h++) acc += rango.pesos[h] * sigma[a][h];
    return { accion: accion.nombre, frecuencia: acc / total };
  });
}

