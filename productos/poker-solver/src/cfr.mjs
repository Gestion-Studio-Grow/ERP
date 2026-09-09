/**
 * Motor CFR+ en forma vectorial, agnóstico del juego.
 *
 * Decisión de diseño clave: el motor NO sabe de naipes. Habla con un objeto
 * `juego` que le contesta tres cosas por jugador (cuántas manos tiene, qué masa
 * del rango rival NO está bloqueada, y qué masa gana/pierde en showdown). Así el
 * MISMO código que resuelve el river se valida contra Kuhn poker, que tiene
 * solución analítica publicada. Un solver que no se puede validar contra una
 * verdad conocida no es un solver: es una opinión con decimales.
 *
 * "Vectorial" = en cada nodo se procesan las ~1300 manos de una pasada, con la
 * probabilidad de llegada (reach) del rival como vector. Es lo que hace viable
 * resolver con rangos completos en vez de muestrear manos.
 */

/** Nodo de decisión. `acciones` es [{ nombre, hijo }]. */
export function nodoDecision(jugador, acciones, nCombos) {
  return {
    tipo: 'decision',
    jugador,
    acciones,
    regret: acciones.map(() => new Float64Array(nCombos)),
    sumaEstrategia: acciones.map(() => new Float64Array(nCombos)),
  };
}

/** Alguien se fue. `monto` es lo que gana el que queda (pot/2 + lo invertido por el que folea). */
export const nodoFold = (ganador, monto) => ({ tipo: 'fold', ganador, monto });

/** Se muestran las cartas. `monto` = pot/2 + lo invertido por cada uno. */
export const nodoShowdown = (monto) => ({ tipo: 'showdown', monto });

/**
 * Regret matching (CFR+): la estrategia del nodo sale de los regrets positivos.
 * Si todos son cero (arranque, o rama nunca visitada) se juega uniforme.
 */
function estrategiaActual(nodo, n) {
  const k = nodo.acciones.length;
  const sigma = Array.from({ length: k }, () => new Float64Array(n));
  for (let h = 0; h < n; h++) {
    let suma = 0;
    for (let a = 0; a < k; a++) suma += nodo.regret[a][h];
    if (suma > 0) {
      for (let a = 0; a < k; a++) sigma[a][h] = nodo.regret[a][h] / suma;
    } else {
      for (let a = 0; a < k; a++) sigma[a][h] = 1 / k;
    }
  }
  return sigma;
}

function cfvTerminal(nodo, juego, reach) {
  const n0 = juego.nCombos[0];
  const n1 = juego.nCombos[1];
  const cfv0 = new Float64Array(n0);
  const cfv1 = new Float64Array(n1);

  if (nodo.tipo === 'fold') {
    const g = nodo.ganador;
    const p = 1 - g;
    const masaGanador = juego.masaNoBloqueada(reach[p], g);
    const masaPerdedor = juego.masaNoBloqueada(reach[g], p);
    const cfvG = g === 0 ? cfv0 : cfv1;
    const cfvP = g === 0 ? cfv1 : cfv0;
    for (let h = 0; h < cfvG.length; h++) cfvG[h] = nodo.monto * masaGanador[h];
    for (let h = 0; h < cfvP.length; h++) cfvP[h] = -nodo.monto * masaPerdedor[h];
    return [cfv0, cfv1];
  }

  // showdown
  const s0 = juego.masaShowdown(reach[1], 0);
  const s1 = juego.masaShowdown(reach[0], 1);
  for (let h = 0; h < n0; h++) cfv0[h] = nodo.monto * (s0.gana[h] - s0.pierde[h]);
  for (let h = 0; h < n1; h++) cfv1[h] = nodo.monto * (s1.gana[h] - s1.pierde[h]);
  return [cfv0, cfv1];
}

/**
 * Una iteración de CFR+ (recorrido completo del árbol).
 *
 * `jugadorActualiza` es la clave del rendimiento: CFR+ actualiza los regrets de
 * UN jugador por iteración, alternando. Actualizando los dos a la vez el motor
 * igual converge, pero al ritmo de CFR vanilla (~1/√T, medido) en vez del de
 * CFR+ (~1/T): a igualdad de iteraciones deja diez veces más plata sobre la mesa.
 */
function iterar(nodo, juego, reach, peso, jugadorActualiza) {
  if (nodo.tipo !== 'decision') return cfvTerminal(nodo, juego, reach);

  const p = nodo.jugador;
  const o = 1 - p;
  const n = juego.nCombos[p];
  const k = nodo.acciones.length;
  const sigma = estrategiaActual(nodo, n);
  const meToca = nodo.jugador === jugadorActualiza;

  const cfvP = new Float64Array(n);
  const cfvO = new Float64Array(juego.nCombos[o]);
  const porAccion = [];

  for (let a = 0; a < k; a++) {
    const reachHijo = [reach[0], reach[1]];
    const rp = new Float64Array(n);
    for (let h = 0; h < n; h++) rp[h] = reach[p][h] * sigma[a][h];
    reachHijo[p] = rp;

    const [c0, c1] = iterar(nodo.acciones[a].hijo, juego, reachHijo, peso, jugadorActualiza);
    const cp = p === 0 ? c0 : c1;
    const co = p === 0 ? c1 : c0;
    porAccion.push(cp);
    for (let h = 0; h < n; h++) cfvP[h] += sigma[a][h] * cp[h];
    for (let h = 0; h < cfvO.length; h++) cfvO[h] += co[h];
  }

  if (!meToca) return p === 0 ? [cfvP, cfvO] : [cfvO, cfvP];

  for (let a = 0; a < k; a++) {
    const regret = nodo.regret[a];
    const suma = nodo.sumaEstrategia[a];
    const cp = porAccion[a];
    for (let h = 0; h < n; h++) {
      // CFR+: el regret se pisa a cero en vez de quedar negativo. Converge
      // bastante más rápido que vanilla y es lo que usan los solvers serios.
      const v = regret[h] + cp[h] - cfvP[h];
      regret[h] = v > 0 ? v : 0;
      // Ponderación lineal del promedio: las iteraciones tardías pesan más,
      // así el arranque uniforme (que es basura) no contamina el promedio.
      suma[h] += peso * reach[p][h] * sigma[a][h];
    }
  }

  return p === 0 ? [cfvP, cfvO] : [cfvO, cfvP];
}

/** Estrategia promedio de un nodo: es la que converge al equilibrio, no la actual. */
export function estrategiaPromedio(nodo) {
  const k = nodo.acciones.length;
  const n = nodo.sumaEstrategia[0].length;
  const sigma = Array.from({ length: k }, () => new Float64Array(n));
  for (let h = 0; h < n; h++) {
    let total = 0;
    for (let a = 0; a < k; a++) total += nodo.sumaEstrategia[a][h];
    for (let a = 0; a < k; a++) {
      sigma[a][h] = total > 0 ? nodo.sumaEstrategia[a][h] / total : 1 / k;
    }
  }
  return sigma;
}

/** Recorre el árbol con las estrategias promedio de los dos y devuelve los cfv. */
function cfvConPromedio(nodo, juego, reach) {
  if (nodo.tipo !== 'decision') return cfvTerminal(nodo, juego, reach);

  const p = nodo.jugador;
  const o = 1 - p;
  const n = juego.nCombos[p];
  const sigma = estrategiaPromedio(nodo);
  const cfvP = new Float64Array(n);
  const cfvO = new Float64Array(juego.nCombos[o]);

  for (let a = 0; a < nodo.acciones.length; a++) {
    const reachHijo = [reach[0], reach[1]];
    const rp = new Float64Array(n);
    for (let h = 0; h < n; h++) rp[h] = reach[p][h] * sigma[a][h];
    reachHijo[p] = rp;
    const [c0, c1] = cfvConPromedio(nodo.acciones[a].hijo, juego, reachHijo);
    const cp = p === 0 ? c0 : c1;
    const co = p === 0 ? c1 : c0;
    for (let h = 0; h < n; h++) cfvP[h] += sigma[a][h] * cp[h];
    for (let h = 0; h < cfvO.length; h++) cfvO[h] += co[h];
  }
  return p === 0 ? [cfvP, cfvO] : [cfvO, cfvP];
}

/**
 * Mejor respuesta: el jugador `br` juega óptimo contra la estrategia promedio
 * del rival. Devuelve el cfv de `br`. Sin esto no hay forma honesta de decir
 * "esto ya convergió": es la única medida de cuánta plata deja sobre la mesa.
 */
function valorMejorRespuesta(nodo, juego, reachRival, br) {
  // En un terminal solo importa el reach del rival: el valor contrafactual de una
  // mano propia no se pondera por la probabilidad de tenerla.
  if (nodo.tipo !== 'decision') return cfvTerminalUnilateral(nodo, juego, reachRival, br);

  if (nodo.jugador === br) {
    // El que hace mejor respuesta elige el máximo por mano: no promedia.
    let mejor = null;
    for (const accion of nodo.acciones) {
      const v = valorMejorRespuesta(accion.hijo, juego, reachRival, br);
      if (mejor === null) mejor = Float64Array.from(v);
      else for (let h = 0; h < mejor.length; h++) if (v[h] > mejor[h]) mejor[h] = v[h];
    }
    return mejor;
  }

  const sigma = estrategiaPromedio(nodo);
  const total = new Float64Array(juego.nCombos[br]);
  for (let a = 0; a < nodo.acciones.length; a++) {
    const rr = new Float64Array(reachRival.length);
    for (let h = 0; h < rr.length; h++) rr[h] = reachRival[h] * sigma[a][h];
    const v = valorMejorRespuesta(nodo.acciones[a].hijo, juego, rr, br);
    for (let h = 0; h < total.length; h++) total[h] += v[h];
  }
  return total;
}

function cfvTerminalUnilateral(nodo, juego, reachRival, br) {
  const n = juego.nCombos[br];
  const cfv = new Float64Array(n);
  if (nodo.tipo === 'fold') {
    const masa = juego.masaNoBloqueada(reachRival, br);
    const signo = nodo.ganador === br ? 1 : -1;
    for (let h = 0; h < n; h++) cfv[h] = signo * nodo.monto * masa[h];
    return cfv;
  }
  const s = juego.masaShowdown(reachRival, br);
  for (let h = 0; h < n; h++) cfv[h] = nodo.monto * (s.gana[h] - s.pierde[h]);
  return cfv;
}

/** EV medio por mano a partir de un cfv, normalizado por la masa de enfrentamientos. */
function evMedio(cfv, pesosPropios, normalizador) {
  let acc = 0;
  for (let h = 0; h < cfv.length; h++) acc += pesosPropios[h] * cfv[h];
  return acc / normalizador;
}

/**
 * Resuelve el árbol.
 * @param {object} raiz nodo raíz
 * @param {object} juego { nCombos, pesos, masaNoBloqueada, masaShowdown, normalizador }
 * @param {{iteraciones?: number, cada?: number}} [opciones]
 */
export function resolver(raiz, juego, opciones = {}) {
  const iteraciones = opciones.iteraciones ?? 400;
  const historial = [];

  for (let t = 1; t <= iteraciones; t++) {
    // Alternado: en la iteración impar aprende el jugador 0, en la par el 1.
    const jugadorActualiza = (t - 1) % 2;
    const peso = Math.ceil(t / 2);
    iterar(
      raiz,
      juego,
      [Float64Array.from(juego.pesos[0]), Float64Array.from(juego.pesos[1])],
      peso,
      jugadorActualiza,
    );
    if (opciones.cada && (t % opciones.cada === 0 || t === iteraciones)) {
      historial.push({ iteracion: t, explotabilidad: explotabilidad(raiz, juego) });
    }
  }

  const [cfv0] = cfvConPromedio(raiz, juego, [
    Float64Array.from(juego.pesos[0]),
    Float64Array.from(juego.pesos[1]),
  ]);

  return {
    raiz,
    iteraciones,
    valorJugador0: evMedio(cfv0, juego.pesos[0], juego.normalizador),
    explotabilidad: explotabilidad(raiz, juego),
    historial,
  };
}

/**
 * Explotabilidad = cuánto gana de más el que juega la mejor respuesta.
 * En un juego de suma cero, en el equilibrio los dos valores de mejor respuesta
 * se cancelan; lo que sobra es la distancia al equilibrio (Nash gap).
 */
export function explotabilidad(raiz, juego) {
  const br0 = valorMejorRespuesta(raiz, juego, Float64Array.from(juego.pesos[1]), 0);
  const br1 = valorMejorRespuesta(raiz, juego, Float64Array.from(juego.pesos[0]), 1);
  const ev0 = evMedio(br0, juego.pesos[0], juego.normalizador);
  const ev1 = evMedio(br1, juego.pesos[1], juego.normalizador);
  return (ev0 + ev1) / 2;
}

export { cfvConPromedio, evMedio };
