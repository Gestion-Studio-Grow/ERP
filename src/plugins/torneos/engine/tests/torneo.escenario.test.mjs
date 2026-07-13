// Escenario estrella (600 parejas), stress multi-semilla y límites de capacidad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, configEvento, SEDES7, SEDES13, CATS } from './_fixtures.mjs';

const T = ENGINE;

/** Verificación completa de invariantes duros de un torneo programado. */
function verificarTorneoCompleto(tor, cfg, etiqueta) {
  const v = T.validar(tor);
  assert.equal(v.ok, true, etiqueta + ' -> validar ok. Errores: ' + JSON.stringify(v.errores.slice(0, 5)));
  assert.equal(v.stats.sinDefinir, 0, etiqueta + ' -> 0 partidos SIN DEFINIR');

  // Todas las parejas con zona; ninguna en dos zonas; zonas 4/3 (o 5 sólo si n=5)
  for (const cat of Object.keys(tor.zonas)) {
    const vistos = new Set();
    let enZonas = 0;
    for (const z of tor.zonas[cat]) {
      assert.ok([3, 4, 5].includes(z.parejas.length), etiqueta + ' zona tamaño válido');
      z.parejas.forEach(pid => { assert.ok(!vistos.has(pid)); vistos.add(pid); enZonas++; });
    }
    assert.equal(enZonas, cfg.categorias[cat].length, etiqueta + ' todas las parejas en zona (' + cat + ')');
  }

  // 0 doble-booking + 0 solapamiento pareja + descanso
  const court = new Set();
  const busy = new Map();
  for (const p of Object.values(tor.partidos)) {
    if (p._start == null) continue;
    const k = p.sede + '|' + p.cancha + '|' + p._diaIdx + '|' + p._start;
    assert.ok(!court.has(k), etiqueta + ' 0 doble-booking');
    court.add(k);
    for (const pid of p._parejasReales || []) {
      if (!busy.has(pid)) busy.set(pid, []);
      busy.get(pid).push({ d: p._diaIdx, s: p._start, e: p._end });
    }
  }
  for (const [, iv] of busy) {
    iv.sort((a, b) => a.d - b.d || a.s - b.s);
    for (let i = 1; i < iv.length; i++) {
      if (iv[i].d !== iv[i - 1].d) continue;
      assert.ok(iv[i].s - iv[i - 1].e >= cfg.descansoMin, etiqueta + ' descanso respetado');
    }
  }

  // Conteo exacto de partidos por fórmula
  let totalEsperado = 0;
  for (const cat of Object.keys(tor.zonas)) {
    for (const z of tor.zonas[cat]) {
      totalEsperado += z.parejas.length === 4 ? 6 : z.parejas.length === 3 ? 3 : z.parejas.length === 5 ? 10 : 0;
    }
    const ll = tor.llaves[cat];
    if (ll && ll.rondas.length) totalEsperado += ll._B - 1;
  }
  assert.equal(tor.stats.totalPartidos, totalEsperado, etiqueta + ' conteo total por fórmula');
  assert.equal(tor.stats.totalPartidos, tor.stats.partidosProgramados + tor.stats.byes, etiqueta + ' total == prog + byes');
}

test('ESCENARIO ESTRELLA: 600 parejas, 13 complejos reales, 4 días -> invariantes duros verdes', () => {
  const t0 = Date.now();
  const cfg = configEvento(600, { sedes: SEDES13, modo: 'patron', semilla: 42 });
  const tor = T.crearTorneo(cfg);
  const genMs = Date.now() - t0;
  verificarTorneoCompleto(tor, cfg, '600/13');
  // rendimiento: < 2s
  assert.ok(genMs < 2000, 'fixture de 600 parejas en <2s (fue ' + genMs + 'ms)');
  // volumen realista
  assert.ok(tor.stats.totalPartidos > 1000, '600 parejas generan >1000 partidos');
  // todas las categorías abren y llegan a FINAL tras simular
  T.simularResultados(tor, 99);
  let finales = 0;
  for (const cat of Object.keys(tor.llaves)) {
    const ll = tor.llaves[cat];
    if (!ll.rondas.length) continue;
    const finalP = tor.partidos[ll.rondas[ll.rondas.length - 1].partidos[0]];
    if (finalP._ganadorPareja) finales++;
  }
  assert.equal(finales, CATS.length, 'las 17 categorías coronan campeón');
});

test('ESCENARIO CONTRATO (7 sedes titulares, 600 parejas): capacidad insuficiente -> error accionable', () => {
  // Con las 7 sedes titulares (33 canchas × 2 días × 10 slots = 660), 600 parejas
  // (~846 partidos de zona) NO entran: el motor DEBE avisar, nunca dejar fixture incompleto.
  const cfg = configEvento(600, { sedes: SEDES7 });
  assert.throws(() => T.crearTorneo(cfg), /Capacidad insuficiente/i);
  try { T.crearTorneo(cfg); } catch (e) {
    assert.match(e.message, /ZONAS/i);
    assert.match(e.message, /faltan \d+/i);
  }
});

test('STRESS: 600 parejas × 20 semillas (patron/azar) -> invariantes verdes en todas', () => {
  for (let s = 1; s <= 20; s++) {
    const modo = s % 2 === 0 ? 'azar' : 'patron';
    const cfg = configEvento(600, { sedes: SEDES13, modo, semilla: s, semillaGen: 42 });
    const tor = T.crearTorneo(cfg);
    verificarTorneoCompleto(tor, cfg, '600/semilla' + s + '/' + modo);
  }
});

test('DETERMINISMO: misma semilla -> fixture idéntico; semillas distintas -> distinto', () => {
  const mk = (semilla) => {
    const tor = T.crearTorneo(configEvento(600, { sedes: SEDES13, modo: 'azar', semilla, semillaGen: 42 }));
    // serializar sólo campos del contrato (sin refs internas)
    return JSON.stringify(Object.values(tor.partidos).map(p => [p.id, p.codigo, p.parejaA, p.parejaB, p.sede, p.cancha, p.dia, p.hora]));
  };
  assert.equal(mk(101), mk(101), 'misma semilla -> byte a byte idéntico');
  assert.notEqual(mk(101), mk(102), 'semillas distintas -> fixtures distintos');
});

test('LÍMITE: 800 parejas con las 7 sedes titulares -> error de capacidad documentado', () => {
  const cfg = configEvento(800, { sedes: SEDES7 });
  assert.throws(() => T.crearTorneo(cfg), /Capacidad insuficiente/i);
  try { T.crearTorneo(cfg); } catch (e) {
    assert.match(e.message, /ZONAS/i);
    assert.match(e.message, /necesitan \d+ slots y hay \d+/i, 'mensaje cuantifica necesidad vs disponible');
  }
});

test('LÍMITE: 850 parejas saturan incluso los 13 complejos reales -> error de capacidad', () => {
  const cfg = configEvento(850, { sedes: SEDES13 });
  assert.throws(() => T.crearTorneo(cfg), /Capacidad insuficiente/i);
});

test('FRONTERA: 800 parejas/13 complejos pasa el chequeo agregado pero se fragmenta -> validar lo reporta (nunca silencioso)', () => {
  // A ~96% de ocupación el empaquetado greedy no logra ubicar todo; lo importante es que
  // el motor NUNCA entrega un fixture incompleto en silencio: validar() lo delata.
  const cfg = configEvento(800, { sedes: SEDES13 });
  const tor = T.crearTorneo(cfg);
  const v = T.validar(tor);
  assert.equal(v.ok, false, 'validar detecta el fixture incompleto');
  assert.ok(v.stats.sinDefinir > 0, 'hay partidos SIN DEFINIR reportados');
  assert.ok(v.errores.some(e => /SIN DEFINIR|saturad/i.test(e)), 'error accionable sobre saturación');
});

test('RENDIMIENTO: generación de 600 parejas repetida se mantiene <2s', () => {
  const cfg = configEvento(600, { sedes: SEDES13, semilla: 5 });
  const t0 = Date.now();
  T.crearTorneo(cfg);
  assert.ok(Date.now() - t0 < 2000);
});
