// INCREMENTO 2 — Gestión de torneo en curso (CONTRATO-GESTION.md).
// Regla de oro: tras CUALQUIER mutación exitosa, validar() sigue ok=true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, configUnaCategoria, parejasCat } from './_fixtures.mjs';

const T = ENGINE;

/** Torneo chico de una categoría (8 parejas -> 2 zonas de 4, llave B=4: SEMIFINAL+FINAL). */
function torneoChico(opts = {}) {
  return T.crearTorneo(configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', opts.n || 8), opts));
}
/** El mismo, en curso con zonas completas y llave sin jugar. */
function torneoZonasJugadas(opts = {}) {
  const cfg = configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', opts.n || 8), opts);
  return T.generarTorneoEnCurso(cfg, 0.6, 7);
}
function assertVerde(tor, etiqueta) {
  const v = T.validar(tor);
  assert.equal(v.ok, true, etiqueta + ': ' + JSON.stringify(v.errores.slice(0, 3)));
}

// ---------------------------------------------------------------------------
// cargarResultado — validación de sets
// ---------------------------------------------------------------------------

test('cargarResultado válido en zona: ok, tabla recalculada, validar verde', () => {
  const tor = torneoChico();
  const zona = tor.zonas['Caballeros 7ma'][0];
  const mid = zona.partidos[0];
  const p = tor.partidos[mid];
  const r = T.cargarResultado(tor, mid, { sets: [[6, 4], [3, 6], [7, 6]] });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(p.resultado.ganador, 'A');
  // tabla recalculada: ganador 2 pts, perdedor 1
  const filaA = zona._tabla.find(f => f.id === p.parejaA);
  const filaB = zona._tabla.find(f => f.id === p.parejaB);
  assert.equal(filaA.Pts, 2);
  assert.equal(filaB.Pts, 1);
  assert.equal(filaA.PJ, 1);
  assertVerde(tor, 'tras cargar resultado de zona');
});

test('sets ilegales rechazados con mensaje claro (y el torneo NO muta)', () => {
  const tor = torneoChico();
  const mid = tor.zonas['Caballeros 7ma'][0].partidos[0];
  const antes = T.serializar(tor);
  const casos = [
    [{ sets: [[6, 5], [6, 3]] }, /ilegal/i],                  // 6/5 no existe
    [{ sets: [[8, 6], [6, 3]] }, /ilegal/i],                  // 8/6 no existe
    [{ sets: [[7, 4], [6, 3]] }, /ilegal/i],                  // 7 solo con 5 o 6
    [{ sets: [[6, 4]] }, /2 o 3 sets/i],                      // un solo set
    [{ sets: [[6, 4], [4, 6]] }, /falta el 3er set/i],        // 1-1 sin tercero
    [{ sets: [[6, 4], [6, 3], [6, 2]] }, /sobra el 3er set/i],// 2-0 con tercero de más
    [{ sets: [[6, 4], [6, 3]], ganador: 'B' }, /no coincide/i], // ganador incoherente
    [{ sets: 'nada' }, /2 o 3 sets/i],
  ];
  for (const [res, regex] of casos) {
    const r = T.cargarResultado(tor, mid, res);
    assert.equal(r.ok, false, 'debe rechazar ' + JSON.stringify(res));
    assert.ok(r.errores.some(e => regex.test(e)), 'mensaje esperado ' + regex + ' en ' + JSON.stringify(r.errores));
  }
  assert.equal(T.serializar(tor), antes, 'ninguna mutación fallida tocó el torneo');
});

test('cargarResultado: partido inexistente y partido BYE -> error claro', () => {
  const tor = torneoZonasJugadas({ n: 12 }); // 3 zonas -> C=6, B=8 -> 2 byes
  const r1 = T.cargarResultado(tor, 99999, { sets: [[6, 2], [6, 3]] });
  assert.equal(r1.ok, false);
  assert.match(r1.errores[0], /no existe/i);
  const bye = Object.values(tor.partidos).find(p => p._esBye);
  assert.ok(bye, 'hay partido BYE');
  const r2 = T.cargarResultado(tor, bye.id, { sets: [[6, 2], [6, 3]] });
  assert.equal(r2.ok, false);
  assert.match(r2.errores[0], /BYE/);
});

// ---------------------------------------------------------------------------
// Cadena de llave
// ---------------------------------------------------------------------------

test('cadena de llave: cargar la FINAL sin semis -> error; semis -> final -> ok con propagación', () => {
  const tor = torneoZonasJugadas(); // 8 parejas: SEMIFINAL x2 + FINAL, zonas completas
  const ll = tor.llaves['Caballeros 7ma'];
  const [semiR, finalR] = ll.rondas;
  assert.equal(finalR.nombre, 'FINAL');
  const finalP = tor.partidos[finalR.partidos[0]];
  const semi1 = tor.partidos[semiR.partidos[0]];
  const semi2 = tor.partidos[semiR.partidos[1]];

  // final sin semis: error accionable
  const rf = T.cargarResultado(tor, finalP.id, { sets: [[6, 3], [6, 4]] });
  assert.equal(rf.ok, false);
  assert.match(rf.errores[0], /no están definidas|falta/i);

  // semi 1 ok, propaga
  const r1 = T.cargarResultado(tor, semi1.id, { sets: [[6, 3], [6, 4]] });
  assert.equal(r1.ok, true, JSON.stringify(r1.errores));
  assert.ok(finalP._resueltoA, 'la final ya conoce a un finalista');
  assertVerde(tor, 'tras semi 1');

  // final sigue bloqueada (falta semi 2)
  const rf2 = T.cargarResultado(tor, finalP.id, { sets: [[6, 3], [6, 4]] });
  assert.equal(rf2.ok, false);

  // semi 2 + final
  assert.equal(T.cargarResultado(tor, semi2.id, { sets: [[7, 5], [4, 6], [7, 6]] }).ok, true);
  const rOk = T.cargarResultado(tor, finalP.id, { sets: [[6, 2], [6, 2]] });
  assert.equal(rOk.ok, true, JSON.stringify(rOk.errores));
  assert.ok(finalP._ganadorPareja, 'hay campeón');
  assert.equal(T.estadoTorneo(tor).fase, 'finalizado');
  assertVerde(tor, 'torneo completo por mutaciones');
});

test('cadena de llave: borrar resultado con el siguiente ya jugado -> error; en orden inverso -> ok', () => {
  const tor = torneoZonasJugadas();
  const ll = tor.llaves['Caballeros 7ma'];
  const semi1 = tor.partidos[ll.rondas[0].partidos[0]];
  const semi2 = tor.partidos[ll.rondas[0].partidos[1]];
  const finalP = tor.partidos[ll.rondas[1].partidos[0]];
  T.cargarResultado(tor, semi1.id, { sets: [[6, 1], [6, 2]] });
  T.cargarResultado(tor, semi2.id, { sets: [[6, 1], [6, 2]] });
  T.cargarResultado(tor, finalP.id, { sets: [[6, 1], [6, 2]] });

  const rb = T.borrarResultado(tor, semi1.id);
  assert.equal(rb.ok, false, 'no se borra una semi con la final jugada');
  assert.match(rb.errores[0], /ya se jugó|borrá primero/i);
  assert.ok(semi1.resultado, 'la semi conserva su resultado');

  assert.equal(T.borrarResultado(tor, finalP.id).ok, true);
  assert.equal(T.borrarResultado(tor, semi1.id).ok, true);
  assert.equal(semi1.resultado, null);
  assert.equal(finalP._resueltoA, null, 'la final ya no conoce a ese finalista');
  assertVerde(tor, 'tras borrar en orden');
});

test('corrección de zona que cambia un clasificado con llave ya jugada -> error (integridad)', () => {
  const tor = torneoZonasJugadas();
  const ll = tor.llaves['Caballeros 7ma'];
  const semi1 = tor.partidos[ll.rondas[0].partidos[0]];
  assert.equal(T.cargarResultado(tor, semi1.id, { sets: [[6, 0], [6, 0]] }).ok, true);
  // dar vuelta un partido de zona del clasificado que jugó la semi -> cambia la tabla
  const zonaA = tor.zonas['Caballeros 7ma'][0];
  let bloqueado = false;
  for (const mid of zonaA.partidos) {
    const p = tor.partidos[mid];
    const ganadorPrevio = p.resultado.ganador;
    const vuelta = ganadorPrevio === 'A' ? { sets: [[0, 6], [0, 6]] } : { sets: [[6, 0], [6, 0]] };
    const r = T.cargarResultado(tor, mid, vuelta);
    if (!r.ok && /borrá primero|cambia quién juega/i.test(r.errores[0])) { bloqueado = true; break; }
  }
  assert.ok(bloqueado, 'alguna corrección que altera clasificados debe bloquearse');
  assertVerde(tor, 'el torneo sigue íntegro');
});

// ---------------------------------------------------------------------------
// reprogramarPartido
// ---------------------------------------------------------------------------

test('reprogramar a slot ocupado -> error con detalle del partido que estorba', () => {
  const tor = torneoChico({ n: 16 });
  const partidos = Object.values(tor.partidos).filter(p => p._start != null && p.fase === 'zona');
  const [a, b] = [partidos[0], partidos.find(q => q !== partidos[0] && q.sede === partidos[0].sede && q.dia === partidos[0].dia)];
  assert.ok(b, 'hay dos partidos en la misma sede y día');
  const r = T.reprogramarPartido(tor, a.id, { sede: b.sede, cancha: b.cancha, dia: b.dia, hora: b.hora });
  assert.equal(r.ok, false);
  assert.ok(r.errores[0].includes(b.codigo), 'menciona el partido que ocupa: ' + r.errores[0]);
  assert.ok(r.errores[0].includes(b.hora), 'menciona la hora');
});

test('reprogramar a slot libre -> ok y validar verde', () => {
  const tor = torneoChico({ n: 8 }); // poquísima ocupación: sobran slots
  const p = Object.values(tor.partidos).find(q => q.fase === 'zona' && q._start != null && q.ronda === 'RONDA 3');
  const destino = { sede: p.sede, cancha: p.cancha, dia: p.dia, hora: '22:00' }; // misma cancha, tarde libre
  const r = T.reprogramarPartido(tor, p.id, destino);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(p.hora, '22:00');
  assertVerde(tor, 'tras reprogramar');
});

test('reprogramar generando solape de pareja o descanso corto -> error', () => {
  const tor = torneoChico({ n: 8 });
  // dos partidos de la misma pareja: RONDA 1 y RONDA 2 de su zona
  const zona = tor.zonas['Caballeros 7ma'][0];
  const pareja = zona.parejas[0];
  const deLaPareja = zona.partidos.map(id => tor.partidos[id]).filter(p => p._parejasReales.includes(pareja));
  assert.ok(deLaPareja.length >= 2);
  const [m1, m2] = deLaPareja;
  // usar una cancha LIBRE a esa hora (la más alta de la sede: con 8 parejas nunca se usa)
  const sedeObj = tor.config.sedes.find(s => s.id === m1.sede);
  const canchaLibre = sedeObj.canchas;
  assert.ok(!Object.values(tor.partidos).some(q => q.sede === m1.sede && q.cancha === canchaLibre && q._start != null), 'la cancha alta está libre');
  // solape exacto (cancha libre, misma hora que el otro partido de la pareja)
  const r1 = T.reprogramarPartido(tor, m2.id, { sede: m1.sede, cancha: canchaLibre, dia: m1.dia, hora: m1.hora });
  assert.equal(r1.ok, false);
  assert.match(r1.errores[0], /solapa|ya juega/i);
  // descanso insuficiente: arrancar 30' después de que termine m1
  const finM1 = (parseInt(m1.hora.slice(0, 2), 10) * 60 + parseInt(m1.hora.slice(3), 10)) + tor.config.slotMin;
  const horaCorta = String(Math.floor((finM1 + 30) / 60)).padStart(2, '0') + ':' + String((finM1 + 30) % 60).padStart(2, '0');
  const r2 = T.reprogramarPartido(tor, m2.id, { sede: m1.sede, cancha: canchaLibre, dia: m1.dia, hora: horaCorta });
  assert.equal(r2.ok, false);
  assert.match(r2.errores[0], /descanso insuficiente/i);
});

test('reprogramar a un día de otra fase / sede o cancha inexistente -> error claro', () => {
  const tor = torneoChico();
  const pz = Object.values(tor.partidos).find(p => p.fase === 'zona' && p._start != null);
  const rDia = T.reprogramarPartido(tor, pz.id, { sede: pz.sede, cancha: 1, dia: '2026-08-08', hora: '10:00' });
  assert.equal(rDia.ok, false);
  assert.match(rDia.errores[0], /fase de zonas/i);
  const rSede = T.reprogramarPartido(tor, pz.id, { sede: 'inexistente', cancha: 1, dia: pz.dia, hora: '10:00' });
  assert.equal(rSede.ok, false);
  assert.match(rSede.errores[0], /no existe/i);
  const rCancha = T.reprogramarPartido(tor, pz.id, { sede: 'granwilly', cancha: 99, dia: pz.dia, hora: '10:00' });
  assert.equal(rCancha.ok, false);
  assert.match(rCancha.errores[0], /canchas/i);
});

test('reprogramar un partido ya jugado -> se permite con advertencia (corrección histórica)', () => {
  const tor = torneoChico({ n: 8 });
  const p = Object.values(tor.partidos).find(q => q.fase === 'zona' && q._start != null && q.ronda === 'RONDA 3');
  assert.equal(T.cargarResultado(tor, p.id, { sets: [[6, 2], [6, 3]] }).ok, true);
  const r = T.reprogramarPartido(tor, p.id, { sede: p.sede, cancha: p.cancha, dia: p.dia, hora: '22:00' });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.ok(r.advertencias.some(a => /ya estaba jugado/i.test(a)));
  assertVerde(tor, 'tras corregir histórico');
});

// ---------------------------------------------------------------------------
// W.O.
// ---------------------------------------------------------------------------

test('W.O. en zona: V=2 al ganador, 0 puntos al que no se presenta, tabla recalculada', () => {
  const tor = torneoChico({ n: 4 }); // 1 zona de 4
  const zona = tor.zonas['Caballeros 7ma'][0];
  const p = tor.partidos[zona.partidos[0]];
  const r = T.marcarWO(tor, p.id, 'B'); // pierde B
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(p.resultado.wo, true);
  assert.equal(p.resultado.ganador, 'A');
  const filaA = zona._tabla.find(f => f.id === p.parejaA);
  const filaB = zona._tabla.find(f => f.id === p.parejaB);
  assert.equal(filaA.Pts, 2, 'ganador del W.O.: 2 puntos');
  assert.equal(filaB.Pts, 0, 'W.O.: 0 puntos (no 1 como la derrota jugada)');
  assertVerde(tor, 'tras W.O. en zona');
});

test('W.O. en llave: propaga el ganador al partido siguiente', () => {
  const tor = torneoZonasJugadas();
  const ll = tor.llaves['Caballeros 7ma'];
  const semi1 = tor.partidos[ll.rondas[0].partidos[0]];
  const finalP = tor.partidos[ll.rondas[1].partidos[0]];
  const quedaba = semi1._resueltoB; // pierde A por W.O. -> avanza B
  const r = T.marcarWO(tor, semi1.id, 'A');
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(semi1._ganadorPareja, quedaba);
  assert.equal(finalP._resueltoA, quedaba, 'el W.O. propagó a la final');
  assertVerde(tor, 'tras W.O. en llave');
});

test('marcarWO con perdedor inválido -> error', () => {
  const tor = torneoChico();
  const mid = tor.zonas['Caballeros 7ma'][0].partidos[0];
  const r = T.marcarWO(tor, mid, 'C');
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /"A" o "B"/);
});

// ---------------------------------------------------------------------------
// generarTorneoEnCurso + estadoTorneo (con CONFIG_DEMO)
// ---------------------------------------------------------------------------

test('generarTorneoEnCurso: avances 0/0.1/0.5/0.6/0.9/1 -> estado coherente y validar verde', () => {
  const esperado = {
    0: t => { assert.equal(t.fase, 'inscripcion'); assert.equal(t.partidosJugados, 0); },
    0.1: t => { assert.equal(t.fase, 'zonas'); assert.ok(t.partidosJugados > 0); },
    0.5: t => { assert.equal(t.fase, 'llave'); },
    0.6: t => { assert.equal(t.fase, 'llave'); },
    0.9: t => { assert.equal(t.fase, 'llave'); },
    1: t => {
      assert.equal(t.fase, 'finalizado');
      const campeones = Object.values(t.campeonesPorCategoria);
      assert.equal(campeones.length, 17);
      campeones.forEach(c => assert.ok(c, 'todas las categorías con campeón'));
    }
  };
  for (const avance of [0, 0.1, 0.5, 0.6, 0.9, 1]) {
    const tor = T.generarTorneoEnCurso(T.CONFIG_DEMO, avance, 2026);
    assertVerde(tor, 'enCurso avance=' + avance);
    const est = T.estadoTorneo(tor);
    // jugados + pendientes + byes = total
    assert.equal(est.partidosJugados + est.partidosPendientes + tor.stats.byes, tor.stats.totalPartidos, 'conteo avance=' + avance);
    esperado[avance](est);
  }
});

test('generarTorneoEnCurso 0.6: zonas del finde 1 completas, llave del finde 2 programada SIN jugar', () => {
  const tor = T.generarTorneoEnCurso(T.CONFIG_DEMO, 0.6, 2026);
  let zonasPendientes = 0, llaveJugada = 0, llaveProgramada = 0, llaveReal = 0;
  for (const p of Object.values(tor.partidos)) {
    if (p._esBye) continue;
    if (p.fase === 'zona' && !p.resultado) zonasPendientes++;
    if (p.fase === 'llave') {
      llaveReal++;
      if (p.resultado) llaveJugada++;
      if (p._start != null) llaveProgramada++;
    }
  }
  assert.equal(zonasPendientes, 0, 'todas las zonas jugadas');
  assert.equal(llaveJugada, 0, 'ningún partido de llave jugado');
  assert.equal(llaveProgramada, llaveReal, 'TODA la llave real está programada a futuro (' + llaveReal + ' partidos)');
  assert.ok(llaveReal > 250, 'volumen de llave esperado para 600 parejas');
});

test('generarTorneoEnCurso: coherencia temporal dura (todo lo jugado es anterior a todo lo pendiente)', () => {
  for (const avance of [0.1, 0.5, 0.9]) {
    const tor = T.generarTorneoEnCurso(T.CONFIG_DEMO, avance, 2026);
    let maxJugado = -Infinity, minPendiente = Infinity;
    for (const p of Object.values(tor.partidos)) {
      if (p._esBye || p._start == null) continue;
      const t = Date.parse(p.dia + 'T00:00:00') + p._start * 60000;
      if (p.resultado) maxJugado = Math.max(maxJugado, t);
      else minPendiente = Math.min(minPendiente, t);
    }
    assert.ok(maxJugado <= minPendiente, 'avance=' + avance + ': jugado hasta ' + new Date(maxJugado).toISOString() + ' vs pendiente desde ' + new Date(minPendiente).toISOString());
  }
});

test('generarTorneoEnCurso: determinístico por semilla; avance inválido lanza', () => {
  const a = T.serializar(T.generarTorneoEnCurso(T.CONFIG_DEMO, 0.6, 2026));
  const b = T.serializar(T.generarTorneoEnCurso(T.CONFIG_DEMO, 0.6, 2026));
  assert.equal(a, b, 'misma semilla -> mismo estado en curso');
  assert.throws(() => T.generarTorneoEnCurso(T.CONFIG_DEMO, 1.5, 1), /entre 0 y 1/i);
});

test('estadoTorneo: proximosPartidos ordenados cronológicamente, ultimosResultados descendentes', () => {
  const tor = T.generarTorneoEnCurso(T.CONFIG_DEMO, 0.6, 2026);
  const est = T.estadoTorneo(tor);
  const dt = id => { const p = tor.partidos[id]; return Date.parse(p.dia + 'T00:00:00') + p._start * 60000; };
  for (let i = 1; i < est.proximosPartidos.length; i++) {
    assert.ok(dt(est.proximosPartidos[i - 1]) <= dt(est.proximosPartidos[i]), 'próximos ascendentes');
  }
  for (let i = 1; i < est.ultimosResultados.length; i++) {
    assert.ok(dt(est.ultimosResultados[i - 1]) >= dt(est.ultimosResultados[i]), 'últimos descendentes');
  }
  est.proximosPartidos.forEach(id => assert.ok(!tor.partidos[id].resultado, 'próximos sin resultado'));
  est.ultimosResultados.forEach(id => assert.ok(tor.partidos[id].resultado, 'últimos con resultado'));
});

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

test('serializar -> deserializar: round-trip sin pérdida y validar verde', () => {
  const tor = T.generarTorneoEnCurso(T.CONFIG_DEMO, 0.6, 2026);
  // mutar algo antes, para serializar un estado gestionado
  const pend = Object.values(tor.partidos).find(p => p.fase === 'llave' && !p._esBye && !p.resultado && p._resueltoA && p._resueltoB);
  assert.equal(T.cargarResultado(tor, pend.id, { sets: [[6, 4], [7, 6]] }).ok, true);

  const s = T.serializar(tor);
  const tor2 = T.deserializar(s);
  assert.equal(T.serializar(tor2), s, 'round-trip byte a byte');
  assert.deepEqual(tor2, JSON.parse(s).torneo, 'estructura idéntica');
  assertVerde(tor2, 'deserializado');
  assert.deepEqual(T.estadoTorneo(tor2), T.estadoTorneo(tor), 'mismo estado');
  // el deserializado sigue siendo gestionable
  const pend2 = Object.values(tor2.partidos).find(p => p.fase === 'zona' && !p.resultado);
  if (pend2) {
    // puede no haber pendientes de zona a 0.6; si hay, la mutación funciona
    assert.equal(T.cargarResultado(tor2, pend2.id, { sets: [[6, 1], [6, 1]] }).ok, true);
  } else {
    const r = T.borrarResultado(tor2, pend.id);
    assert.equal(r.ok, true, JSON.stringify(r.errores));
  }
});

test('deserializar: JSON corrupto o esquema ajeno -> error claro', () => {
  assert.throws(() => T.deserializar('esto no es json'), /JSON inválido/i);
  assert.throws(() => T.deserializar('{"a":1}'), /_schema/i);
  assert.throws(() => T.deserializar(''), /string JSON/i);
  assert.throws(() => T.deserializar(JSON.stringify({ _schema: 'wpe-torneo@1', torneo: { config: {} } })), /incompleto/i);
});

// ---------------------------------------------------------------------------
// CONFIG_DEMO
// ---------------------------------------------------------------------------

test('CONFIG_DEMO: 600 parejas / 13 complejos / semilla 2026, crearTorneo verde y determinístico', () => {
  const cfg = T.CONFIG_DEMO;
  assert.equal(Object.keys(cfg.categorias).length, 17);
  const total = Object.values(cfg.categorias).reduce((a, arr) => a + arr.length, 0);
  assert.equal(total, 600);
  assert.equal(cfg.sedes.length, 13);
  assert.equal(cfg.semilla, 2026);
  assert.equal(cfg.dias.length, 4);
  const tor = T.crearTorneo(cfg);
  assertVerde(tor, 'CONFIG_DEMO');
  // determinístico: dos accesos, dos torneos idénticos
  assert.equal(T.serializar(T.crearTorneo(T.CONFIG_DEMO)), T.serializar(tor));
});

test('CONFIG_DEMO devuelve una config FRESCA en cada acceso (inmutable frente a mutaciones del front)', () => {
  const a = T.CONFIG_DEMO;
  a.slotMin = 1;
  a.sedes.pop();
  const b = T.CONFIG_DEMO;
  assert.equal(b.slotMin, 90);
  assert.equal(b.sedes.length, 13);
});

// ---------------------------------------------------------------------------
// REGLA DE ORO: 50 mutaciones aleatorias válidas -> validar sigue verde
// ---------------------------------------------------------------------------

test('50 mutaciones aleatorias válidas (semilla fija) -> validar verde tras cada una', () => {
  const cfg = configUnaCategoria('Caballeros 7ma', parejasCat('Caballeros 7ma', 40));
  const tor = T.generarTorneoEnCurso(cfg, 0.55, 11); // zonas jugadas, llave por delante
  const rnd = T._util.mulberry32(20260711);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const setsLegales = [
    [[6, 3], [6, 4]], [[7, 5], [6, 2]], [[6, 4], [3, 6], [7, 6]], [[2, 6], [1, 6]], [[6, 7], [6, 3], [6, 1]]
  ];
  let aplicadas = 0, intentos = 0;
  while (aplicadas < 50 && intentos < 600) {
    intentos++;
    const dado = rnd();
    let r = null;
    if (dado < 0.45) {
      // cargar resultado en un pendiente jugable
      const cand = Object.values(tor.partidos).filter(p => !p._esBye && !p.resultado &&
        (p.fase === 'zona' || (p._resueltoA && p._resueltoB && p._resueltoA !== 'BYE' && p._resueltoB !== 'BYE')));
      if (!cand.length) continue;
      r = T.cargarResultado(tor, pick(cand).id, { sets: pick(setsLegales) });
    } else if (dado < 0.6) {
      // W.O.
      const cand = Object.values(tor.partidos).filter(p => !p._esBye && !p.resultado &&
        (p.fase === 'zona' || (p._resueltoA && p._resueltoB && p._resueltoA !== 'BYE' && p._resueltoB !== 'BYE')));
      if (!cand.length) continue;
      r = T.marcarWO(tor, pick(cand).id, rnd() < 0.5 ? 'A' : 'B');
    } else if (dado < 0.75) {
      // borrar un resultado de llave cuyo siguiente no se jugó (elegible)
      const cand = Object.values(tor.partidos).filter(p => p.fase === 'llave' && !p._esBye && p.resultado && !p.resultado.bye &&
        (!p._next || !tor.partidos[p._next].resultado || tor.partidos[p._next].resultado.bye));
      if (!cand.length) continue;
      r = T.borrarResultado(tor, pick(cand).id);
    } else {
      // reprogramar un pendiente a un hueco de su misma sede+día
      const cand = Object.values(tor.partidos).filter(p => !p._esBye && !p.resultado && p._start != null);
      if (!cand.length) continue;
      const p = pick(cand);
      const sede = tor.config.sedes.find(s => s.id === p.sede);
      const horas = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30'];
      r = T.reprogramarPartido(tor, p.id, { sede: p.sede, cancha: 1 + Math.floor(rnd() * sede.canchas), dia: p.dia, hora: pick(horas) });
      if (!r.ok) continue; // destino ocupado/descanso: intento no válido, no cuenta
    }
    if (r && r.ok) {
      aplicadas++;
      const v = T.validar(tor);
      assert.equal(v.ok, true, 'validar verde tras mutación #' + aplicadas + ': ' + JSON.stringify(v.errores.slice(0, 2)));
    }
  }
  assert.ok(aplicadas >= 50, 'se aplicaron ' + aplicadas + ' mutaciones válidas (>=50) en ' + intentos + ' intentos');
});

test('las mutaciones fallidas NUNCA mutan el torneo (byte a byte)', () => {
  const tor = torneoZonasJugadas();
  const antes = T.serializar(tor);
  const ll = tor.llaves['Caballeros 7ma'];
  const finalP = tor.partidos[ll.rondas[1].partidos[0]];
  // varias mutaciones inválidas seguidas
  T.cargarResultado(tor, finalP.id, { sets: [[6, 2], [6, 3]] });          // final sin semis
  T.cargarResultado(tor, 99999, { sets: [[6, 2], [6, 3]] });              // inexistente
  T.borrarResultado(tor, finalP.id);                                       // sin resultado
  T.reprogramarPartido(tor, finalP.id, { sede: 'nope', cancha: 1, dia: 'x', hora: 'y' });
  assert.equal(T.serializar(tor), antes, 'estado intacto tras mutaciones rechazadas');
});
