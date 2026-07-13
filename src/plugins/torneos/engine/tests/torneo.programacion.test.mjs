// Pruebas de programación (scheduling) e invariantes duros de agenda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, configEvento, configUnaCategoria, parejasCat, SEDES7, DIAS } from './_fixtures.mjs';

const T = ENGINE;

/** Chequeos duros directos sobre los partidos programados (independientes de validar()). */
function chequeosDuros(tor, config) {
  const descanso = config.descansoMin;
  // 1) 0 doble-booking
  const court = new Map();
  for (const p of Object.values(tor.partidos)) {
    if (p._start == null) continue;
    const k = p.sede + '|' + p.cancha + '|' + p._diaIdx + '|' + p._start;
    assert.ok(!court.has(k), 'doble-booking en ' + k + ' (' + court.get(k) + ' y ' + p.codigo + ')');
    court.set(k, p.codigo);
  }
  // 2) 0 solapamiento de pareja + descanso
  const busy = new Map();
  for (const p of Object.values(tor.partidos)) {
    if (p._start == null) continue;
    for (const pid of p._parejasReales || []) {
      if (!busy.has(pid)) busy.set(pid, []);
      busy.get(pid).push({ d: p._diaIdx, s: p._start, e: p._end, cod: p.codigo });
    }
  }
  for (const [pid, iv] of busy) {
    iv.sort((a, b) => a.d - b.d || a.s - b.s);
    for (let i = 1; i < iv.length; i++) {
      if (iv[i].d !== iv[i - 1].d) continue;
      assert.ok(iv[i].s >= iv[i - 1].e, 'pareja ' + pid + ' solapada (' + iv[i - 1].cod + '/' + iv[i].cod + ')');
      assert.ok(iv[i].s - iv[i - 1].e >= descanso, 'descanso pareja ' + pid + ' >= ' + descanso);
    }
  }
  // 3) precedencia de llave
  for (const p of Object.values(tor.partidos)) {
    if (p.fase !== 'llave' || !p._feeders || p._start == null) continue;
    for (const fid of p._feeders) {
      const fp = tor.partidos[fid];
      if (!fp || fp._start == null) continue;
      const fin = fp._diaIdx * 100000 + fp._end;
      const ini = p._diaIdx * 100000 + p._start;
      assert.ok(ini >= fin, 'precedencia ' + p.codigo + ' tras ' + fp.codigo);
      if (fp._diaIdx === p._diaIdx) assert.ok(p._start - fp._end >= descanso, 'precedencia+descanso ' + p.codigo);
    }
  }
  // 4) partidos de una zona: misma sede y mismo día
  for (const cat of Object.keys(tor.zonas)) {
    for (const z of tor.zonas[cat]) {
      let sede = null, dia = null;
      for (const mid of z.partidos) {
        const p = tor.partidos[mid];
        if (p._start == null) continue;
        if (sede == null) { sede = p.sede; dia = p._diaIdx; }
        else { assert.equal(p.sede, sede, z.nombre + ' misma sede'); assert.equal(p._diaIdx, dia, z.nombre + ' mismo día'); }
      }
    }
  }
  // 5) fase correcta de días: zonas en zonaDias, llave en llaveDias
  const zonaDias = new Set(config.zonaDias);
  const llaveDias = new Set(config.llaveDias);
  for (const p of Object.values(tor.partidos)) {
    if (p._start == null) continue;
    if (p.fase === 'zona') assert.ok(zonaDias.has(p._diaIdx), 'zona en zonaDias');
    else assert.ok(llaveDias.has(p._diaIdx), 'llave en llaveDias');
  }
}

test('evento realista (400 parejas, 7 sedes): validar ok=true, sin errores', () => {
  const cfg = configEvento(400, { modo: 'patron' });
  const tor = T.crearTorneo(cfg);
  const v = T.validar(tor);
  assert.equal(v.ok, true, 'validar ok. Errores: ' + JSON.stringify(v.errores.slice(0, 3)));
  assert.equal(v.errores.length, 0);
  chequeosDuros(tor, cfg);
});

test('invariantes duros sobre una categoría grande (7ma, 50 parejas)', () => {
  const cfg = configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 50));
  const tor = T.crearTorneo(cfg);
  chequeosDuros(tor, cfg);
  const v = T.validar(tor);
  assert.equal(v.ok, true, JSON.stringify(v.errores.slice(0, 3)));
});

test('semifinal y final tienden al Complejo Sede el último día de llave', () => {
  const cfg = configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 42));
  const tor = T.crearTorneo(cfg);
  const ll = tor.llaves['Caballeros 7ma'];
  const finalP = tor.partidos[ll.rondas[ll.rondas.length - 1].partidos[0]];
  assert.equal(finalP.fase, 'llave');
  if (finalP._start != null) {
    assert.equal(finalP.sede, 'granwilly', 'final en Complejo Sede');
    assert.equal(finalP._diaIdx, 3, 'final el último día');
  }
});

test('stats coherentes: totalPartidos == programados + byes', () => {
  const cfg = configEvento(400);
  const tor = T.crearTorneo(cfg);
  const s = tor.stats;
  assert.equal(s.totalPartidos, Object.keys(tor.partidos).length);
  assert.equal(s.totalPartidos, s.partidosProgramados + s.byes, 'total == programados + byes (sin SIN DEFINIR)');
  assert.ok(s.ocupacionPct >= 0 && s.ocupacionPct <= 100);
});

test('capacidad insuficiente: error accionable ANTES de programar (no fixture incompleto)', () => {
  // 300 parejas en 1 sola sede chica y pocos días -> debe lanzar
  const parejas = T.generarParejas(300, ['Caballeros 7ma'], 1);
  const cfg = {
    categorias: { 'Caballeros 7ma': parejas },
    sedes: [{ id: 'unica', nombre: 'Única', canchas: 2 }],
    dias: DIAS, slotMin: 90, descansoMin: 90, clasificanPorZona: 2,
    zonaDias: [0, 1], llaveDias: [2, 3], modo: 'patron', semilla: 1
  };
  assert.throws(() => T.crearTorneo(cfg), /Capacidad insuficiente/i);
  try { T.crearTorneo(cfg); } catch (e) {
    assert.match(e.message, /slots/i);
    assert.match(e.message, /faltan \d+/i, 'mensaje indica el faltante');
  }
});

test('descanso configurable respetado (descansoMin=180)', () => {
  const cfg = configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 16), { descansoMin: 180 });
  const tor = T.crearTorneo(cfg);
  chequeosDuros(tor, cfg);
});

test('config inválida: sin sedes / sin días / slot 0 -> throw', () => {
  const base = configEvento(20);
  assert.throws(() => T.crearTorneo(Object.assign({}, base, { sedes: [] })), /sedes/i);
  assert.throws(() => T.crearTorneo(Object.assign({}, base, { dias: [] })), /dias|días/i);
  assert.throws(() => T.crearTorneo(Object.assign({}, base, { slotMin: 0 })), /slotMin/i);
});
