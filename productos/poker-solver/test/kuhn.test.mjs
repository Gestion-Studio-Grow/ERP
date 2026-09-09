import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolver, estrategiaPromedio, explotabilidad } from '../src/cfr.mjs';
import { arbolKuhn, juegoKuhn, VALOR_EXACTO_P0, JOTA, REINA, REY } from '../src/kuhn.mjs';

function correr(iteraciones) {
  const arbol = arbolKuhn();
  const juego = juegoKuhn();
  const salida = resolver(arbol.raiz, juego, { iteraciones });
  return { ...salida, arbol, juego };
}

test('el motor clava el valor analítico de Kuhn (-1/18)', () => {
  const { valorJugador0 } = correr(3000);
  assert.ok(
    Math.abs(valorJugador0 - VALOR_EXACTO_P0) < 1e-3,
    `valor ${valorJugador0.toFixed(6)} vs exacto ${VALOR_EXACTO_P0.toFixed(6)}`,
  );
});

test('la explotabilidad tiende a cero (converge de verdad)', () => {
  const pocas = correr(50).explotabilidad;
  const muchas = correr(3000).explotabilidad;
  // Umbral medido, no aspiracional: con CFR+ alternado el motor da ~5e-5 a 3000
  // iteraciones. Si una refactorización lo empeora un orden de magnitud, este
  // test se cae — que es exactamente para lo que está.
  assert.ok(muchas < 2e-4, `explotabilidad final ${muchas} debería ser ~0`);
  assert.ok(muchas < pocas, `con más iteraciones tiene que bajar: ${pocas} → ${muchas}`);
  assert.ok(muchas >= -1e-9, 'la explotabilidad no puede ser negativa');
});

test('el segundo jugador juega el equilibrio único conocido frente a una apuesta', () => {
  const { arbol } = correr(6000);
  const [foldear, pagar] = estrategiaPromedio(arbol.p1FrenteApuesta);
  // Verdades publicadas del equilibrio de Kuhn:
  assert.ok(foldear[JOTA] > 0.99, `con J tiene que foldear siempre, foldea ${foldear[JOTA]}`);
  assert.ok(pagar[REY] > 0.99, `con K tiene que pagar siempre, paga ${pagar[REY]}`);
  assert.ok(
    Math.abs(pagar[REINA] - 1 / 3) < 0.02,
    `con Q paga 1/3 de las veces, dio ${pagar[REINA].toFixed(4)}`,
  );
});

test('el primer jugador nunca apuesta la reina y farolea el rey 3 veces más que la jota', () => {
  const { arbol } = correr(6000);
  const [, apostar] = estrategiaPromedio(arbol.raiz);
  assert.ok(apostar[REINA] < 0.02, `no debe apostar Q, apuesta ${apostar[REINA].toFixed(4)}`);
  // Familia de equilibrios: apuesta J con α y K con 3α, para α en [0, 1/3].
  assert.ok(apostar[JOTA] <= 1 / 3 + 0.02, `α fuera de rango: ${apostar[JOTA].toFixed(4)}`);
  assert.ok(
    Math.abs(apostar[REY] - 3 * apostar[JOTA]) < 0.03,
    `apuesta K=${apostar[REY].toFixed(4)} debería ser 3x apuesta J=${apostar[JOTA].toFixed(4)}`,
  );
});

test('el primer jugador defiende la reina con α + 1/3, atando los dos nodos', () => {
  // Ojo con la tentación de escribir "defiende 1/3": la frecuencia publicada es
  // α + 1/3, donde α es la MISMA α con la que apuesta la jota en la raíz. Es el
  // test más fuerte de todos porque liga dos nodos distintos del árbol: si el
  // motor tuviera los reach mal propagados, las dos frecuencias no cerrarían.
  const { arbol } = correr(6000);
  const [, apostar] = estrategiaPromedio(arbol.raiz);
  const [foldear, pagar] = estrategiaPromedio(arbol.p0FrenteApuesta);
  const alfa = apostar[JOTA];
  assert.ok(foldear[JOTA] > 0.98, 'con J foldea');
  assert.ok(pagar[REY] > 0.98, 'con K paga');
  assert.ok(
    Math.abs(pagar[REINA] - (alfa + 1 / 3)) < 0.02,
    `con Q defiende α+1/3 = ${(alfa + 1 / 3).toFixed(4)}, dio ${pagar[REINA].toFixed(4)}`,
  );
});

test('las estrategias son distribuciones de probabilidad válidas', () => {
  const { arbol } = correr(500);
  for (const nodo of [arbol.raiz, arbol.p1TrasPaso, arbol.p0FrenteApuesta, arbol.p1FrenteApuesta]) {
    const sigma = estrategiaPromedio(nodo);
    for (let h = 0; h < 3; h++) {
      let suma = 0;
      for (const accion of sigma) {
        assert.ok(accion[h] >= -1e-12 && accion[h] <= 1 + 1e-12, `probabilidad fuera de [0,1]: ${accion[h]}`);
        suma += accion[h];
      }
      assert.ok(Math.abs(suma - 1) < 1e-9, `las probabilidades suman ${suma}, no 1`);
    }
  }
});

test('la explotabilidad baja monótona en el registro del historial', () => {
  const arbol = arbolKuhn();
  const juego = juegoKuhn();
  const { historial } = resolver(arbol.raiz, juego, { iteraciones: 2000, cada: 400 });
  assert.ok(historial.length >= 4);
  const primera = historial[0].explotabilidad;
  const ultima = historial[historial.length - 1].explotabilidad;
  assert.ok(ultima < primera / 3, `esperaba caída fuerte: ${primera} → ${ultima}`);
  assert.ok(historial.every((h) => h.explotabilidad >= -1e-12), 'nunca negativa');
});
