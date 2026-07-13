// Casos borde y simulación de resultados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, configUnaCategoria, parejasCat, DIAS, SEDES7 } from './_fixtures.mjs';

const T = ENGINE;

test('borde: 3 parejas -> 1 zona de 3 + FINAL directa', () => {
  const tor = T.crearTorneo(configUnaCategoria('Damas 8va', parejasCat('Damas 8va', 3)));
  assert.equal(tor.zonas['Damas 8va'].length, 1);
  assert.equal(tor.zonas['Damas 8va'][0].parejas.length, 3);
  assert.equal(tor.zonas['Damas 8va'][0].partidos.length, 3);
  const ll = tor.llaves['Damas 8va'];
  assert.equal(ll.rondas.length, 1);
  assert.equal(ll.rondas[0].nombre, 'FINAL');
  assert.equal(ll._B, 2);
  assert.equal(T.validar(tor).ok, true);
});

test('borde: 4 parejas -> 1 zona de 4 (6 partidos) + FINAL', () => {
  const tor = T.crearTorneo(configUnaCategoria('Damas 8va', parejasCat('Damas 8va', 4)));
  assert.equal(tor.zonas['Damas 8va'][0].partidos.length, 6);
  assert.equal(tor.llaves['Damas 8va'].rondas[0].nombre, 'FINAL');
  assert.equal(T.validar(tor).ok, true);
});

test('borde: 5 parejas -> 1 zona de 5 (10 partidos) + FINAL directa (fallback documentado)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Damas 8va', parejasCat('Damas 8va', 5)));
  const z = tor.zonas['Damas 8va'];
  assert.equal(z.length, 1);
  assert.equal(z[0].parejas.length, 5);
  assert.equal(z[0].partidos.length, 10, 'round robin de 5 = 10 partidos');
  assert.equal(tor.llaves['Damas 8va'].rondas[0].nombre, 'FINAL');
  assert.equal(T.validar(tor).ok, true);
});

test('borde: n primo grande (23) reparte en zonas 4/3 válidas', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 6ta', parejasCat('Caballeros 6ta', 23)));
  const sizes = tor.zonas['Caballeros 6ta'].map(z => z.parejas.length);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 23);
  sizes.forEach(s => assert.ok(s === 3 || s === 4));
  assert.equal(T.validar(tor).ok, true);
});

test('borde: 0 parejas -> la categoría no abre (sin zonas, con advertencia)', () => {
  const cfg = {
    categorias: { 'Caballeros 8va': [], 'Damas 8va': parejasCat('Damas 8va', 8) },
    sedes: SEDES7, dias: DIAS, slotMin: 90, descansoMin: 90, clasificanPorZona: 2,
    zonaDias: [0, 1], llaveDias: [2, 3], modo: 'patron', semilla: 3
  };
  const tor = T.crearTorneo(cfg);
  assert.ok(!tor.zonas['Caballeros 8va'], 'categoría vacía no genera zonas');
  assert.ok(tor.zonas['Damas 8va'], 'la otra categoría sí abre');
  assert.ok(tor.stats.advertencias && tor.stats.advertencias.some(a => /no abre/i.test(a)));
});

test('borde: 1 y 2 parejas -> error claro (no abre con menos de 3)', () => {
  assert.throws(() => T.crearTorneo(configUnaCategoria('Damas 8va', parejasCat('Damas 8va', 1))), /al menos 3|mínimo 3/i);
  assert.throws(() => T.crearTorneo(configUnaCategoria('Damas 8va', parejasCat('Damas 8va', 2))), /al menos 3|mínimo 3/i);
});

test('borde: byes masivos (33 parejas -> 9 zonas, C=18, B=32, 14 byes)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 33)));
  const ll = tor.llaves['Caballeros 7ma'];
  assert.equal(ll._Z, 9);
  assert.equal(ll._C, 18);
  assert.equal(ll._B, 32);
  assert.equal(ll.byes.length, 14, '32 - 18 = 14 byes');
  // conteo total = B - 1
  let total = 0; ll.rondas.forEach(r => (total += r.partidos.length));
  assert.equal(total, 31);
  assert.equal(T.validar(tor).ok, true);
});

test('simular: llave se completa hasta la FINAL con ganadores consistentes con los sets', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 30)));
  T.simularResultados(tor, 123);
  const ll = tor.llaves['Caballeros 7ma'];
  // cada partido de llave con dos parejas reales debe tener ganador consistente
  for (const cat of Object.keys(tor.llaves)) {
    void cat;
  }
  for (const ronda of ll.rondas) {
    for (const mid of ronda.partidos) {
      const p = tor.partidos[mid];
      if (p._esBye) continue;
      if (p.resultado && !p.resultado.bye && p.resultado.sets.length) {
        let a = 0, b = 0;
        p.resultado.sets.forEach(s => { if (s[0] > s[1]) a++; else b++; });
        const ganadorSets = a > b ? 'A' : 'B';
        assert.equal(p.resultado.ganador, ganadorSets, 'ganador consistente con sets en ' + p.codigo);
      }
    }
  }
  // hay campeón
  const finalP = tor.partidos[ll.rondas[ll.rondas.length - 1].partidos[0]];
  assert.ok(finalP._ganadorPareja, 'la FINAL tiene un campeón');
});

test('simular: puntos de zona V=2 D=1 W.O.=0 (invariante de suma de puntos)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 40)));
  T.simularResultados(tor, 55);
  for (const z of tor.zonas['Caballeros 7ma']) {
    let nonwo = 0, wo = 0, ptsTotal = 0;
    z.partidos.forEach(mid => {
      const p = tor.partidos[mid];
      if (p.resultado.wo) wo++; else nonwo++;
    });
    z._tabla.forEach(row => (ptsTotal += row.Pts));
    // cada partido normal reparte 3 pts (2+1); cada W.O. reparte 2 (2+0)
    assert.equal(ptsTotal, 3 * nonwo + 2 * wo, 'suma de puntos coherente en ' + z.nombre);
  }
});

test('simular: hay W.O. ~3% en un volumen grande (cobertura W.O. zona y llave)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 60)));
  T.simularResultados(tor, 7);
  let wo = 0, total = 0;
  Object.values(tor.partidos).forEach(p => {
    if (p.resultado && !p.resultado.bye) { total++; if (p.resultado.wo) wo++; }
  });
  assert.ok(wo > 0, 'debe aparecer al menos un W.O. en el volumen');
  assert.ok(wo / total < 0.12, 'la tasa de W.O. es baja (~3%)');
});

test('simular: determinístico por semilla', () => {
  const cfg = configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 20));
  const a = T.crearTorneo(cfg); T.simularResultados(a, 42);
  const b = T.crearTorneo(cfg); T.simularResultados(b, 42);
  const ra = Object.values(a.partidos).map(p => p.resultado && p.resultado.ganador);
  const rb = Object.values(b.partidos).map(p => p.resultado && p.resultado.ganador);
  assert.deepEqual(ra, rb, 'misma semilla -> mismos resultados');
});
