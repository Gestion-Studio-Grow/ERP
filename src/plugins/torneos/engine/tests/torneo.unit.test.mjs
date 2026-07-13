// Pruebas unitarias de los bloques del motor (funciones puras).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from './_fixtures.mjs';

const U = ENGINE._util;

test('version expuesta', () => {
  assert.equal(typeof ENGINE.version, 'string');
  assert.match(ENGINE.version, /^\d+\.\d+\.\d+$/);
});

test('mulberry32 es determinístico y estable', () => {
  const a = U.mulberry32(12345);
  const b = U.mulberry32(12345);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  // rango [0,1)
  seqA.forEach(x => { assert.ok(x >= 0 && x < 1); });
  // semillas distintas -> secuencias distintas
  const c = U.mulberry32(12346);
  assert.notEqual(a(), c());
});

test('repartoZonas maximiza zonas de 4 y nunca <3', () => {
  const casos = {
    3: [3], 4: [4], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3],
    10: [4, 3, 3], 11: [4, 4, 3], 12: [4, 4, 4], 13: [4, 3, 3, 3],
    16: [4, 4, 4, 4], 17: [4, 4, 3, 3, 3], 40: null
  };
  for (const n in casos) {
    const sizes = U.repartoZonas(+n);
    assert.equal(sizes.reduce((a, b) => a + b, 0), +n, 'suma == n para n=' + n);
    sizes.forEach(s => assert.ok(s >= 3, 'ninguna zona <3 (n=' + n + ')'));
    if (casos[n]) assert.deepEqual(sizes.slice().sort((a, b) => b - a), casos[n].slice().sort((a, b) => b - a), 'reparto n=' + n);
    // maximiza zonas de 4: no debería existir otro reparto con más 4s
    const z4 = sizes.filter(s => s === 4).length;
    const z3 = sizes.filter(s => s === 3).length;
    if (+n !== 5) assert.ok(z3 <= 3, 'a lo sumo 3 zonas de 3 (n=' + n + ')');
    void z4;
  }
});

test('repartoZonas: n=5 es el fallback documentado (1 zona de 5)', () => {
  assert.deepEqual(U.repartoZonas(5), [5]);
});

test('repartoZonas lanza para n<3', () => {
  assert.throws(() => U.repartoZonas(2), /mínimo 3/i);
  assert.throws(() => U.repartoZonas(0), /mínimo 3/i);
});

test('roundRobin: conteos por fórmula (z3=3, z4=6, z5=10)', () => {
  const r3 = U.roundRobin(['a', 'b', 'c']);
  assert.equal(r3.length, 3, 'z3 -> 3 rondas');
  assert.equal(r3.reduce((a, r) => a + r.length, 0), 3, 'z3 -> 3 partidos');

  const r4 = U.roundRobin(['a', 'b', 'c', 'd']);
  assert.equal(r4.length, 3, 'z4 -> 3 rondas');
  assert.equal(r4.reduce((a, r) => a + r.length, 0), 6, 'z4 -> 6 partidos');

  const r5 = U.roundRobin(['a', 'b', 'c', 'd', 'e']);
  assert.equal(r5.length, 5, 'z5 -> 5 rondas');
  assert.equal(r5.reduce((a, r) => a + r.length, 0), 10, 'z5 -> 10 partidos');
});

test('roundRobin: cada pareja juega contra todas exactamente una vez', () => {
  const members = ['a', 'b', 'c', 'd'];
  const rounds = U.roundRobin(members);
  const pares = new Set();
  rounds.forEach(r => r.forEach(m => {
    const k = [m[0], m[1]].sort().join('-');
    assert.ok(!pares.has(k), 'sin repetir cruce ' + k);
    pares.add(k);
  }));
  assert.equal(pares.size, 6); // C(4,2)
  // en cada ronda una pareja juega a lo sumo una vez
  rounds.forEach(r => {
    const seen = new Set();
    r.forEach(m => { assert.ok(!seen.has(m[0]) && !seen.has(m[1])); seen.add(m[0]); seen.add(m[1]); });
  });
});

test('seedPositions: sembrado estándar (mitades correctas)', () => {
  assert.deepEqual(U.seedPositions(2), [1, 2]);
  assert.deepEqual(U.seedPositions(4), [1, 4, 2, 3]);
  assert.deepEqual(U.seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  // seed 1 y seed 2 siempre en mitades opuestas
  [2, 4, 8, 16, 32, 64].forEach(B => {
    const s = U.seedPositions(B);
    assert.equal(s.length, B);
    const pos1 = s.indexOf(1), pos2 = s.indexOf(2);
    const half1 = pos1 < B / 2, half2 = pos2 < B / 2;
    assert.notEqual(half1, half2, 'seed1 y seed2 en mitades opuestas (B=' + B + ')');
    // cada seed 1..B aparece una vez
    assert.equal(new Set(s).size, B);
  });
});

test('nombreRondaLlave respeta la nomenclatura real', () => {
  assert.equal(U.nombreRondaLlave(1), 'FINAL');
  assert.equal(U.nombreRondaLlave(2), 'SEMIFINAL');
  assert.equal(U.nombreRondaLlave(4), '4º DE FINAL');
  assert.equal(U.nombreRondaLlave(8), '8º DE FINAL');
  assert.equal(U.nombreRondaLlave(16), '16º DE FINAL');
  assert.equal(U.nombreRondaLlave(32), '32avos DE FINAL');
});

test('abreviarCategoria genera códigos estilo real', () => {
  assert.equal(U.abreviarCategoria('Caballeros 7ma'), 'CA7');
  assert.equal(U.abreviarCategoria('Caballeros 8va'), 'CA8');
  assert.equal(U.abreviarCategoria('Damas 5ta'), 'DA5');
  assert.equal(U.abreviarCategoria('Caballeros 5ta +35'), 'CA5+35');
  assert.equal(U.abreviarCategoria('Damas 6ta +30'), 'DA6+30');
});

test('slotsDeDia: 08:00-23:30 a 90 min = 10 slots que terminan antes del cierre', () => {
  const slots = U.slotsDeDia({ desde: '08:00', hasta: '23:30' }, 90);
  assert.equal(slots.length, 10);
  assert.equal(slots[0], 8 * 60);
  assert.ok(slots[slots.length - 1] + 90 <= 23 * 60 + 30, 'último partido termina antes de hasta');
});

test('nextPow2', () => {
  assert.equal(U.nextPow2(2), 2);
  assert.equal(U.nextPow2(3), 4);
  assert.equal(U.nextPow2(6), 8);
  assert.equal(U.nextPow2(42), 64);
});
