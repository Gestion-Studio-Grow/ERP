import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, parseCard, cardToString } from '../src/cards.mjs';
import { evaluar, categoriaDe, CATEGORIA } from '../src/evaluator.mjs';

const puntaje = (texto) => evaluar(parseCards(texto));
const cat = (texto) => categoriaDe(puntaje(texto));

test('ida y vuelta de naipes', () => {
  for (const t of ['As', 'Kd', '2c', 'Th', '9s']) {
    assert.equal(cardToString(parseCard(t)), t);
  }
  assert.throws(() => parseCard('Xx'));
  assert.throws(() => parseCards('AsAs'), /repetidos/);
});

test('reconoce cada categoría con 5 naipes', () => {
  assert.equal(cat('AsKsQsJsTs'), CATEGORIA.ESCALERA_COLOR);
  assert.equal(cat('9s9d9c9h2s'), CATEGORIA.POKER);
  assert.equal(cat('9s9d9c2h2s'), CATEGORIA.FULL);
  assert.equal(cat('As7s5s3s2s'), CATEGORIA.COLOR);
  assert.equal(cat('9s8d7c6h5s'), CATEGORIA.ESCALERA);
  assert.equal(cat('9s9d9c7h5s'), CATEGORIA.TRIO);
  assert.equal(cat('9s9d7c7h5s'), CATEGORIA.DOBLE_PAR);
  assert.equal(cat('9s9d7c5h3s'), CATEGORIA.PAR);
  assert.equal(cat('As9d7c5h3s'), CATEGORIA.CARTA_ALTA);
});

test('la rueda A2345 es escalera y es la PEOR escalera', () => {
  assert.equal(cat('As2d3c4h5s'), CATEGORIA.ESCALERA);
  assert.ok(puntaje('As2d3c4h5s') < puntaje('2s3d4c5h6s'), 'la rueda no puede ganarle a 6-alta');
  // y no debe confundirse con color: rueda del mismo palo es escalera de color baja
  assert.equal(cat('As2s3s4s5s'), CATEGORIA.ESCALERA_COLOR);
  assert.ok(puntaje('As2s3s4s5s') < puntaje('6s7s8s9sTs'));
});

test('el orden entre categorías es el del poker', () => {
  const escalera = [
    'As9d7c5h3s',   // carta alta
    '9s9d7c5h3s',   // par
    '9s9d7c7h5s',   // doble par
    '9s9d9c7h5s',   // trío
    '9s8d7c6h5s',   // escalera
    'As7s5s3s2s',   // color
    '9s9d9c2h2s',   // full
    '9s9d9c9h2s',   // póker
    'AsKsQsJsTs',   // escalera de color
  ].map(puntaje);
  for (let i = 1; i < escalera.length; i++) {
    assert.ok(escalera[i] > escalera[i - 1], `posición ${i} no supera a la anterior`);
  }
});

test('con 7 naipes elige la mejor mano de 5', () => {
  // color: hacen falta 5 del mismo palo entre los 7 (As 2s 5s 9s Ks)
  assert.equal(cat('AsAd 2s5s9s Ks3c'.replace(/ /g, '')), CATEGORIA.COLOR);
  assert.equal(cat('9s9d 9c2h2s 3s4s'.replace(/ /g, '')), CATEGORIA.FULL);
  assert.equal(cat('9s9d 9c9h2s 2d3c'.replace(/ /g, '')), CATEGORIA.POKER);
  // la mano de 5 elegida ignora los 2 naipes que no aportan
  assert.equal(
    puntaje('AsKsQsJsTs 2d3c'.replace(/ /g, '')),
    puntaje('AsKsQsJsTs'),
    'agregar basura no puede cambiar la mejor mano de 5',
  );
});

test('propiedad del poker: con 7 naipes, color y full NO pueden coexistir', () => {
  // Demostración por conteo: un color usa 5 naipes del mismo palo, y esos 5 tienen
  // rangos distintos entre sí. Quedan 2 naipes libres, y un full (3+2) necesita 3
  // duplicados de rango. 2 < 3 ⇒ imposible. Lo mismo para el póker: 4 del mismo
  // rango son 4 palos distintos, así que a lo sumo 1 es del palo del color, y
  // 4 + 5 = 9 > 7 naipes.
  //
  // Este test COMPRUEBA la propiedad, no la enuncia: busca un contraejemplo sobre
  // 200.000 manos y además exige que el evaluador sea consistente con ella.
  let conColor = 0;
  let conFull = 0;

  for (let semilla = 0; semilla < 200000; semilla++) {
    const mano = manoAlAzar(7, semilla);

    const porRango = new Array(15).fill(0);
    const porPalo = [0, 0, 0, 0];
    for (const naipe of mano) {
      porRango[(naipe >> 2) + 2]++;
      porPalo[naipe & 3]++;
    }

    const hayColor = porPalo.some((c) => c >= 5);
    const hayPoker = porRango.some((c) => c >= 4);
    const tercias = porRango.filter((c) => c >= 3).length;
    const parejas = porRango.filter((c) => c >= 2).length;
    // Full = un trío más otra pareja distinta (dos tríos también sirven).
    const hayFull = tercias >= 1 && parejas >= 2;

    assert.ok(
      !(hayColor && (hayFull || hayPoker)),
      `contraejemplo con ${mano.map(cardToString).join('')}: color y full/póker a la vez`,
    );

    // Y la consecuencia sobre el evaluador, que es lo que realmente nos importa:
    // si hay color disponible, la categoría tiene que ser color o escalera de color
    // (no puede ser full ni póker, porque acabamos de descartar que existan).
    const categoria = categoriaDe(evaluar(mano));
    if (hayColor) {
      assert.ok(
        categoria === CATEGORIA.COLOR || categoria === CATEGORIA.ESCALERA_COLOR,
        `con 5 del mismo palo el evaluador devolvió ${categoria} en ${mano.map(cardToString).join('')}`,
      );
      conColor++;
    }
    if (categoria === CATEGORIA.FULL || categoria === CATEGORIA.POKER) {
      assert.ok(!hayColor, 'devolvió full/póker con un color disponible');
      conFull++;
    }
  }

  // Cobertura: si el muestreo no vio ninguno de los dos casos, el test no probó
  // nada y hay que saberlo.
  assert.ok(conColor > 100, `el muestreo vio solo ${conColor} colores: no alcanza para probar nada`);
  assert.ok(conFull > 100, `el muestreo vio solo ${conFull} fulls/pókers: no alcanza`);
});

test('el camino rápido de 7 naipes coincide con la fuerza bruta de 5', () => {
  // Verificación fuerte: evaluar(7) debe ser exactamente el máximo de
  // evaluar(5) sobre las 21 combinaciones. Si el camino rápido tuviera un
  // agujero (una categoría mal ordenada, un kicker de más), acá se cae.
  for (let semilla = 0; semilla < 4000; semilla++) {
    const mano = manoAlAzar(7, semilla);
    let mejor = -1;
    for (const cinco of combinaciones(mano, 5)) {
      const v = evaluar(cinco);
      if (v > mejor) mejor = v;
    }
    assert.equal(
      evaluar(mano),
      mejor,
      `discrepancia con la mano ${mano.map(cardToString).join('')}`,
    );
  }
});

test('los kickers deciden dentro de la misma categoría', () => {
  assert.ok(puntaje('AsAd KsQs Jh') > puntaje('AsAd KsQs 9h'), 'kicker más alto debe ganar');
  assert.ok(puntaje('AsAdKsKh2c') > puntaje('AsAdQsQh2c'), 'doble par más alto debe ganar');
  assert.equal(puntaje('AsAdKsQsJh'), puntaje('AcAhKdQdJc'), 'los palos no valen nada');
});

test('tres pares con 7 naipes: usa los dos altos y el tercero puede ser kicker', () => {
  // KK QQ 22 + A: doble par KK QQ con kicker A
  const p = puntaje('KsKd QsQd 2s2d As'.replace(/ /g, ''));
  assert.equal(categoriaDe(p), CATEGORIA.DOBLE_PAR);
  assert.ok(p > puntaje('KsKdQsQd2s2dJh'), 'el as debe ser mejor kicker que la jota');
});

// ——— utilitarios del test ———

/** PRNG determinista (mulberry32): los tests no pueden depender de Math.random. */
function prng(semilla) {
  let a = semilla + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function manoAlAzar(n, semilla) {
  const rnd = prng(semilla);
  const baraja = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [baraja[i], baraja[j]] = [baraja[j], baraja[i]];
  }
  return baraja.slice(0, n);
}

function* combinaciones(arr, k, inicio = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = inicio; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combinaciones(arr, k, i + 1, acc);
    acc.pop();
  }
}
