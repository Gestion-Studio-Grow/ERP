import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, FULL_DECK } from '../src/cards.mjs';
import { evaluar } from '../src/evaluator.mjs';
import { parseRange } from '../src/range.mjs';
import { crearMesaShowdown, crearMesaShowdownFuerzaBruta } from '../src/showdown.mjs';

/* ------------------------------------------------------------------ */
/* PRNG determinista — nunca Math.random: un test que falla tiene que  */
/* poder reproducirse con la misma semilla.                           */
/* ------------------------------------------------------------------ */

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Generadores de casos                                               */
/* ------------------------------------------------------------------ */

/** Los 1326 combos (a < b) que no tocan el board. */
function combosLibres(board) {
  const muertas = new Set(board);
  const salida = [];
  for (let a = 0; a < 52; a++) {
    if (muertas.has(a)) continue;
    for (let b = a + 1; b < 52; b++) {
      if (!muertas.has(b)) salida.push([a, b]);
    }
  }
  return salida;
}

/** Elige `k` combos al azar del pool (sin repetir). El orden queda mezclado a propósito. */
function rangoAlAzar(pool, k, rng) {
  return barajar(pool, rng).slice(0, Math.min(k, pool.length));
}

/** Reach no uniforme, con ~20% de ceros exactos (manos que ya foldearon). */
function reachAlAzar(n, rng) {
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = rng() < 0.2 ? 0 : rng();
  return r;
}

/** Anchos variados: angostos de 3, medios, anchos de 300+ y de vez en cuando todo el pool. */
function anchoAlAzar(pool, rng) {
  const u = rng();
  if (u < 0.2) return 3;
  if (u < 0.45) return 5 + Math.floor(rng() * 40);
  if (u < 0.85) return 300 + Math.floor(rng() * 500);
  return pool.length;
}

const REALISTAS = [
  '22+, A2s+, A9o+, KTs+, KQo, QTs+, JTs, T9s, 98s',
  'QQ+, AKs, AKo:0.5, AQs:0.5',
  'TT-66, A5s-A2s, T9s-65s, KJo:0.3',
  '22+, A2+, K2s+, K9o+, Q8s+, QTo+, J8s+, JTo, T8s+, 97s+, 86s+, 75s+, 64s+, 53s+',
];

function casoAlAzar(rng, i) {
  const board = barajar(FULL_DECK, rng).slice(0, 5);
  const pool = combosLibres(board);
  let combos0, combos1;
  if (i % 7 === 3) {
    // rangos "de jugador" de verdad, con pesos parciales y muchas manos gemelas
    combos0 = parseRange(REALISTAS[i % REALISTAS.length], board).combos;
    combos1 = parseRange(REALISTAS[(i + 1) % REALISTAS.length], board).combos;
  } else if (i % 7 === 5) {
    // mismo rango para los dos: maximiza gemelos y empates
    combos0 = rangoAlAzar(pool, anchoAlAzar(pool, rng), rng);
    combos1 = barajar(combos0, rng);
  } else {
    combos0 = rangoAlAzar(pool, anchoAlAzar(pool, rng), rng);
    combos1 = rangoAlAzar(pool, anchoAlAzar(pool, rng), rng);
  }
  return {
    board, combos0, combos1,
    reach0: reachAlAzar(combos0.length, rng),
    reach1: reachAlAzar(combos1.length, rng),
  };
}

/* ------------------------------------------------------------------ */
/* Helpers de comparación                                             */
/* ------------------------------------------------------------------ */

const TOL = 1e-9;

function assertVectoresCasiIguales(a, b, mensaje) {
  assert.equal(a.length, b.length, `${mensaje}: largos distintos`);
  for (let i = 0; i < a.length; i++) {
    assert.ok(
      Math.abs(a[i] - b[i]) <= TOL,
      `${mensaje}: índice ${i}, rápido=${a[i]} bruto=${b[i]} (dif ${a[i] - b[i]})`,
    );
  }
}

const suma = (v) => v.reduce((acc, x) => acc + x, 0);

const mesaDe = (texto0, texto1, boardTexto) => {
  const board = parseCards(boardTexto);
  const r0 = parseRange(texto0, board);
  const r1 = parseRange(texto1, board);
  return { board, r0, r1 };
};

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

test('equivalencia rápido vs fuerza bruta en casos aleatorios (ambas funciones, ambos héroes)', () => {
  const rng = mulberry32(20240909);
  const CASOS = 48;
  let comparaciones = 0;
  for (let i = 0; i < CASOS; i++) {
    const { board, combos0, combos1, reach0, reach1 } = casoAlAzar(rng, i);
    const rapida = crearMesaShowdown(combos0, combos1, board);
    const bruta = crearMesaShowdownFuerzaBruta(combos0, combos1, board);

    for (const hero of [0, 1]) {
      const reachRival = hero === 0 ? reach1 : reach0;
      const etiqueta = `caso ${i} héroe ${hero} (${combos0.length}x${combos1.length})`;

      assertVectoresCasiIguales(
        rapida.masaNoBloqueada(reachRival, hero),
        bruta.masaNoBloqueada(reachRival, hero),
        `${etiqueta} masaNoBloqueada`,
      );
      const sr = rapida.masaShowdown(reachRival, hero);
      const sb = bruta.masaShowdown(reachRival, hero);
      assertVectoresCasiIguales(sr.gana, sb.gana, `${etiqueta} gana`);
      assertVectoresCasiIguales(sr.pierde, sb.pierde, `${etiqueta} pierde`);
      comparaciones++;
    }
  }
  assert.equal(comparaciones, CASOS * 2);
});

test('caso chico calculado a mano', () => {
  // Board: Ac Kd 7h 4s 2c
  //   héroe h0 = AsKs → doble par AA KK, kicker 7
  //   héroe h1 = QhJh → carta alta A K Q J 7
  //   héroe h2 = 7c7d → trío de sietes, kickers A K
  //   rival  r0 = AhQs (0.50) → par de ases
  //   rival  r1 = KsQc (0.25) → par de reyes — comparte Ks con h0
  //   rival  r2 = 7s7c (1.00) → trío de sietes — comparte 7c con h2
  //   rival  r3 = QhJh (0.40) → carta alta — GEMELA de h1 (mismos dos naipes)
  //   rival  r4 = AdKh (0.30) → doble par AA KK kicker 7 — EMPATA con h0 sin compartir naipe
  //   total rival = 0.5 + 0.25 + 1.0 + 0.4 + 0.3 = 2.45
  const board = parseCards('AcKd7h4s2c');
  const combos0 = [parseCards('AsKs'), parseCards('QhJh'), parseCards('7c7d')];
  const combos1 = [
    parseCards('AhQs'), parseCards('KsQc'), parseCards('7s7c'), parseCards('QhJh'), parseCards('AdKh'),
  ];
  const reach1 = Float64Array.from([0.5, 0.25, 1.0, 0.4, 0.3]);
  const reach0 = Float64Array.from([1.0, 0.5, 0.2]);
  const mesa = crearMesaShowdown(combos0, combos1, board);
  const casi = (real, esperado, msg) => assert.ok(Math.abs(real - esperado) < 1e-12, `${msg}: ${real} ≠ ${esperado}`);

  // Héroe 0:
  //   h0: bloquea r1 (0.25) → no bloqueada 2.20; gana r0+r3 = 0.90; pierde r2 = 1.00; empata r4 = 0.30
  //   h1: bloquea r3 (0.40) → no bloqueada 2.05; gana 0; pierde r0+r1+r2+r4 = 2.05
  //   h2: bloquea r2 (1.00) → no bloqueada 1.45; gana r0+r1+r3+r4 = 1.45; pierde 0
  const nb0 = mesa.masaNoBloqueada(reach1, 0);
  casi(nb0[0], 2.20, 'nb h0'); casi(nb0[1], 2.05, 'nb h1'); casi(nb0[2], 1.45, 'nb h2');
  const s0 = mesa.masaShowdown(reach1, 0);
  casi(s0.gana[0], 0.90, 'gana h0'); casi(s0.pierde[0], 1.00, 'pierde h0');
  casi(s0.gana[1], 0.00, 'gana h1'); casi(s0.pierde[1], 2.05, 'pierde h1');
  casi(s0.gana[2], 1.45, 'gana h2'); casi(s0.pierde[2], 0.00, 'pierde h2');

  // Héroe 1 (reach del jugador 0 = [1.0, 0.5, 0.2]; total 1.7):
  //   r0 AhQs: nada bloqueado → 1.70; gana h1 = 0.5; pierde h0+h2 = 1.2
  //   r1 KsQc: bloquea h0 → 0.70; gana h1 = 0.5; pierde h2 = 0.2
  //   r2 7s7c: bloquea h2 → 1.50; gana h0+h1 = 1.5; pierde 0
  //   r3 QhJh: bloquea h1 → 1.20; gana 0; pierde h0+h2 = 1.2
  //   r4 AdKh: nada bloqueado → 1.70; gana h1 = 0.5; pierde h2 = 0.2; empata h0 = 1.0
  const nb1 = mesa.masaNoBloqueada(reach0, 1);
  const esperadoNb1 = [1.7, 0.7, 1.5, 1.2, 1.7];
  esperadoNb1.forEach((e, j) => casi(nb1[j], e, `nb r${j}`));
  const s1 = mesa.masaShowdown(reach0, 1);
  const esperadoGana1 = [0.5, 0.5, 1.5, 0.0, 0.5];
  const esperadoPierde1 = [1.2, 0.2, 0.0, 1.2, 0.2];
  esperadoGana1.forEach((e, j) => casi(s1.gana[j], e, `gana r${j}`));
  esperadoPierde1.forEach((e, j) => casi(s1.pierde[j], e, `pierde r${j}`));

  // El oráculo tiene que decir exactamente lo mismo (si no, el que está mal es el test).
  const bruta = crearMesaShowdownFuerzaBruta(combos0, combos1, board);
  assertVectoresCasiIguales(nb0, bruta.masaNoBloqueada(reach1, 0), 'bruta nb0');
  assertVectoresCasiIguales(nb1, bruta.masaNoBloqueada(reach0, 1), 'bruta nb1');
});

test('propiedad de bloqueo: tener un naipe que todo el rango rival necesita anula su masa', () => {
  // Combos explícitos y en este orden: parseRange ordena por índice canónico, y acá
  // el reach se asigna por posición.
  const board = parseCards('AcKd7h4s2c');
  const combos0 = [parseCards('AhQh'), parseCards('QsJs'), parseCards('9d8d')];
  const combos1 = [ // todo el rango rival pasa por el Ah
    parseCards('AhKh'), parseCards('AhQs'), parseCards('AhJc'), parseCards('AhTd'), parseCards('Ah9s'),
  ];
  const mesa = crearMesaShowdown(combos0, combos1, board);
  const reach = Float64Array.from([0.9, 0.7, 0.5, 0.3, 0.1]);
  const total = suma(reach);
  const nb = mesa.masaNoBloqueada(reach, 0);

  // AhQh tiene el Ah → se lleva puesto TODO el rango: reducción exacta = total.
  assert.equal(nb[0], 0, 'con el Ah en mano no queda ningún combo rival');
  // QsJs solo choca con AhQs (reach 0.7): reducción exacta = 0.7.
  assert.ok(Math.abs(nb[1] - (total - 0.7)) < 1e-12, `QsJs debería ver ${total - 0.7}, vio ${nb[1]}`);
  // 9d8d no choca con nada: ve todo.
  assert.ok(Math.abs(nb[2] - total) < 1e-12);
});

test('conservación: gana + pierde + empate == masaNoBloqueada para cada mano', () => {
  const rng = mulberry32(777);
  for (let i = 0; i < 12; i++) {
    const { board, combos0, combos1, reach0, reach1 } = casoAlAzar(rng, i);
    const mesa = crearMesaShowdown(combos0, combos1, board);

    for (const hero of [0, 1]) {
      const heroe = hero === 0 ? combos0 : combos1;
      const rival = hero === 0 ? combos1 : combos0;
      const reachRival = hero === 0 ? reach1 : reach0;

      // Masa de empate por fuerza bruta, calculada acá mismo: fuerza con el
      // evaluador y compatibilidad de naipes a mano, sin pasar por showdown.mjs.
      const fuerza = (c) => evaluar([c[0], c[1], ...board]);
      const fHero = heroe.map(fuerza);
      const fRival = rival.map(fuerza);
      const empate = new Float64Array(heroe.length);
      for (let h = 0; h < heroe.length; h++) {
        const [a1, a2] = heroe[h];
        for (let j = 0; j < rival.length; j++) {
          const [b1, b2] = rival[j];
          const comparten = a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2;
          if (!comparten && fHero[h] === fRival[j]) empate[h] += reachRival[j];
        }
      }

      const nb = mesa.masaNoBloqueada(reachRival, hero);
      const { gana, pierde } = mesa.masaShowdown(reachRival, hero);
      for (let h = 0; h < heroe.length; h++) {
        const lados = gana[h] + pierde[h] + empate[h];
        assert.ok(
          Math.abs(lados - nb[h]) <= TOL,
          `caso ${i} héroe ${hero} mano ${h}: ${gana[h]} + ${pierde[h]} + ${empate[h]} ≠ ${nb[h]}`,
        );
      }
    }
  }
});

test('suma cero: mismo rango y reach uniforme → masa total ganada == masa total perdida', () => {
  const rng = mulberry32(4242);
  for (let i = 0; i < 6; i++) {
    const board = barajar(FULL_DECK, rng).slice(0, 5);
    const pool = combosLibres(board);
    const combos = rangoAlAzar(pool, 300 + Math.floor(rng() * 400), rng);
    const mesa = crearMesaShowdown(combos, combos, board);
    const uniforme = new Float64Array(combos.length).fill(1);

    const s0 = mesa.masaShowdown(uniforme, 0);
    const s1 = mesa.masaShowdown(uniforme, 1);
    // La matriz de enfrentamientos es antisimétrica: cada par (h gana a j) aparece
    // una vez como gana[h] y una vez como pierde[j].
    assert.ok(Math.abs(suma(s0.gana) - suma(s0.pierde)) <= TOL, `caso ${i}: ${suma(s0.gana)} vs ${suma(s0.pierde)}`);
    // Y con los mismos combos en el mismo orden, las dos direcciones son idénticas.
    assertVectoresCasiIguales(s0.gana, s1.gana, `caso ${i} gana simétrica`);
    assertVectoresCasiIguales(s0.pierde, s1.pierde, `caso ${i} pierde simétrica`);
    // Sanidad: cada mano vale lo mismo que su gemela y no se "juega contra sí misma":
    // la gemela está bloqueada, así que la diagonal no aporta a ningún lado.
    assert.ok(suma(s0.gana) > 0, 'con 300+ combos tiene que haber alguna victoria');
  }
});

test('combos que chocan con el board se toleran: valen cero y coinciden con el oráculo', () => {
  const board = parseCards('AcKd7h4s2c');
  const combos0 = [parseCards('AsKs'), parseCards('AcQc') /* Ac está en el board */, parseCards('7c7d')];
  const combos1 = [parseCards('AhQs'), parseCards('Kd2d') /* Kd está en el board */, parseCards('7s7c')];
  const rapida = crearMesaShowdown(combos0, combos1, board);
  const bruta = crearMesaShowdownFuerzaBruta(combos0, combos1, board);
  const reach1 = Float64Array.from([0.5, 0.9, 1.0]);
  const reach0 = Float64Array.from([1.0, 0.9, 0.2]);

  for (const hero of [0, 1]) {
    const reach = hero === 0 ? reach1 : reach0;
    const nb = rapida.masaNoBloqueada(reach, hero);
    const s = rapida.masaShowdown(reach, hero);
    assertVectoresCasiIguales(nb, bruta.masaNoBloqueada(reach, hero), `nb héroe ${hero}`);
    const sb = bruta.masaShowdown(reach, hero);
    assertVectoresCasiIguales(s.gana, sb.gana, `gana héroe ${hero}`);
    assertVectoresCasiIguales(s.pierde, sb.pierde, `pierde héroe ${hero}`);
    // la mano imposible no ve a nadie
    assert.equal(nb[1], 0);
    assert.equal(s.gana[1], 0);
    assert.equal(s.pierde[1], 0);
  }
  // y como rival, su reach (0.9) no se cuenta para nadie: AsKs ve 0.5 + 1.0
  assert.ok(Math.abs(rapida.masaNoBloqueada(reach1, 0)[0] - 1.5) < 1e-12);
});

test('las salidas son arrays nuevos: una llamada no pisa el resultado de la anterior', () => {
  const { board, r0, r1 } = mesaDe('QQ+, AKs', 'TT+, AQs+, KQs', 'AcKd7h4s2c');
  const mesa = crearMesaShowdown(r0.combos, r1.combos, board);
  const a = new Float64Array(r1.combos.length).fill(1);
  const b = new Float64Array(r1.combos.length).fill(0.5);
  const s1 = mesa.masaShowdown(a, 0);
  const copia = Float64Array.from(s1.gana);
  mesa.masaShowdown(b, 0);
  assert.deepEqual(Array.from(s1.gana), Array.from(copia));
});

test('entradas inválidas fallan ruidoso', () => {
  const board = parseCards('AcKd7h4s2c');
  const ok = [parseCards('AsKs')];
  assert.throws(() => crearMesaShowdown(ok, ok, parseCards('AcKd7h4s')), /5 naipes/);
  assert.throws(() => crearMesaShowdown([parseCards('AsKs'), parseCards('KsAs')], ok, board), /repetido/);
  assert.throws(() => crearMesaShowdown([[5, 5]], ok, board), /repite el naipe/);
  const mesa = crearMesaShowdown(ok, ok, board);
  assert.throws(() => mesa.masaNoBloqueada(new Float64Array(2), 0), /largo 1/);
  assert.throws(() => mesa.masaShowdown([1], 0), /Float64Array/);
});
