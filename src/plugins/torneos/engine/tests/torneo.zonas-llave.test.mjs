// Pruebas de construcción de zonas y llave (estructura, siembra, byes, mitades).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, configUnaCategoria, configEvento, parejasCat, CATS } from './_fixtures.mjs';

const T = ENGINE;

test('zonas: todas las parejas tienen zona, ninguna en dos zonas, tamaños 4/3', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 30)));
  const zonas = tor.zonas['Caballeros 7ma'];
  const vistos = new Set();
  let total = 0;
  zonas.forEach(z => {
    assert.ok(z.parejas.length === 4 || z.parejas.length === 3, 'zona 4 o 3');
    z.parejas.forEach(pid => {
      assert.ok(!vistos.has(pid), 'pareja ' + pid + ' no repetida entre zonas');
      vistos.add(pid); total++;
    });
  });
  assert.equal(total, 30, 'todas las parejas ubicadas');
});

test('conteo de partidos de zona por fórmula (z4=6, z3=3)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 30)));
  tor.zonas['Caballeros 7ma'].forEach(z => {
    const esperado = z.parejas.length === 4 ? 6 : 3;
    assert.equal(z.partidos.length, esperado);
  });
});

test('llave: nº de partidos = clasificados + byes − 1 = B − 1', () => {
  for (const n of [8, 12, 16, 20, 30, 42, 50]) {
    const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', n)));
    const ll = tor.llaves['Caballeros 7ma'];
    let total = 0;
    ll.rondas.forEach(r => (total += r.partidos.length));
    assert.equal(total, ll._B - 1, 'n=' + n + ': ' + total + ' == B-1 (' + (ll._B - 1) + ')');
    // clasificados + byes - 1 == B - 1
    assert.equal(ll._C + ll.byes.length - 1, ll._B - 1, 'clasificados + byes - 1 == B-1 (n=' + n + ')');
  }
});

test('llave: byes a los mejores 1º (semillas más fuertes)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 20)));
  const ll = tor.llaves['Caballeros 7ma'];
  // Z=? para 20 -> repartoZonas(20)=[4,4,4,4,4-? ] ; C=2Z, B=pow2
  // byes = B - C, y deben ser todos 1º si byes<=Z
  const byes = ll.byes;
  if (byes.length <= ll._Z) {
    byes.forEach(seed => assert.match(seed, /^1/, 'bye en 1º: ' + seed));
  }
  // los byes son las semillas más fuertes: verificamos que el conteo coincide con B-C
  assert.equal(byes.length, ll._B - ll._C);
});

test('llave: 1º y 2º de la misma zona en mitades opuestas', () => {
  for (const n of [12, 20, 30, 42]) {
    const tor = T.crearTorneo(configUnaCategoria('Caballeros 6ta', parejasCat('Caballeros 6ta', n)));
    const ll = tor.llaves['Caballeros 6ta'];
    Object.keys(ll._mitades).forEach(letra => {
      const m = ll._mitades[letra];
      if (m.p1 && m.p2) assert.notEqual(m.p1, m.p2, 'n=' + n + ' zona ' + letra + ': 1º y 2º en mitades opuestas');
    });
  }
});

test('rondas de llave nombradas como el real hasta FINAL', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 42)));
  const nombres = tor.llaves['Caballeros 7ma'].rondas.map(r => r.nombre);
  assert.equal(nombres[nombres.length - 1], 'FINAL');
  assert.equal(nombres[nombres.length - 2], 'SEMIFINAL');
  assert.ok(nombres.includes('4º DE FINAL'));
  assert.ok(nombres.includes('8º DE FINAL'));
  assert.ok(nombres.includes('16º DE FINAL'));
});

test('modo patron: los 2 mejores rankings no comparten zona', () => {
  const tor = T.crearTorneo(configEvento(400, { modo: 'patron' }));
  for (const cat of CATS) {
    const zs = tor.zonas[cat];
    if (!zs || zs.length < 2) continue;
    const parejas = tor.config.categorias[cat].slice().sort((a, b) => a.ranking - b.ranking);
    const z1 = zs.find(z => z.parejas.includes(parejas[0].id));
    const z2 = zs.find(z => z.parejas.includes(parejas[1].id));
    assert.notEqual(z1, z2, cat + ': top-1 y top-2 en zonas distintas');
  }
});

test('modo azar: determinístico por semilla; semillas distintas cambian zonas', () => {
  const a = T.crearTorneo(configEvento(200, { modo: 'azar', semilla: 7 }));
  const b = T.crearTorneo(configEvento(200, { modo: 'azar', semilla: 7 }));
  const c = T.crearTorneo(configEvento(200, { modo: 'azar', semilla: 8 }));
  assert.deepEqual(a.zonas, b.zonas, 'misma semilla -> mismas zonas');
  assert.notDeepEqual(a.zonas, c.zonas, 'semilla distinta -> zonas distintas');
});

test('modo manual: zonas válidas se aceptan', () => {
  const parejas = parejasCat('Damas 4ta', 8);
  const manual = { 'Damas 4ta': [parejas.slice(0, 4).map(p => p.id), parejas.slice(4, 8).map(p => p.id)] };
  const tor = T.crearTorneo(configUnaCategoria('Damas 4ta', parejas, { modo: 'manual', manual }));
  assert.equal(tor.zonas['Damas 4ta'].length, 2);
  assert.deepEqual(tor.zonas['Damas 4ta'][0].parejas, parejas.slice(0, 4).map(p => p.id));
});

test('modo manual: pareja repetida -> error claro en castellano', () => {
  const parejas = parejasCat('Damas 4ta', 8);
  const ids = parejas.map(p => p.id);
  const manual = { 'Damas 4ta': [[ids[0], ids[1], ids[2], ids[3]], [ids[0], ids[5], ids[6], ids[7]]] }; // ids[0] repetida, falta ids[4]
  assert.throws(() => T.crearTorneo(configUnaCategoria('Damas 4ta', parejas, { modo: 'manual', manual })), /repetida/i);
});

test('modo manual: pareja faltante -> error claro', () => {
  const parejas = parejasCat('Damas 4ta', 8);
  const ids = parejas.map(p => p.id);
  const manual = { 'Damas 4ta': [[ids[0], ids[1], ids[2], ids[3]], [ids[4], ids[5], ids[6]]] }; // falta ids[7]
  assert.throws(() => T.crearTorneo(configUnaCategoria('Damas 4ta', parejas, { modo: 'manual', manual })), /sin zona|faltante|quedó/i);
});

test('modo manual: zona de 2 -> error claro (mínimo 3)', () => {
  const parejas = parejasCat('Damas 4ta', 6);
  const ids = parejas.map(p => p.id);
  const manual = { 'Damas 4ta': [[ids[0], ids[1]], [ids[2], ids[3], ids[4], ids[5]]] };
  assert.throws(() => T.crearTorneo(configUnaCategoria('Damas 4ta', parejas, { modo: 'manual', manual })), /mínimo 3/i);
});

test('códigos de partido con formato real (abbr-###)', () => {
  const tor = T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 12)));
  Object.values(tor.partidos).forEach(p => {
    assert.match(p.codigo, /^CA7-\d{3}$/, 'codigo ' + p.codigo);
  });
  // ids continuos del evento
  const ids = Object.values(tor.partidos).map(p => p.id).sort((a, b) => a - b);
  assert.equal(ids[0], 1);
  assert.equal(ids[ids.length - 1], ids.length);
});
