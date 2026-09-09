import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearMercado } from '../src/exchanges.mjs';
import { correrPasada, crearAcumulador, ESTRATEGIAS } from '../src/motor.mjs';
import { crearRegistro } from '../src/registro.mjs';
import { COSTOS, VEREDICTO } from '../src/costos.mjs';

test('una pasada offline: estadística coherente, curvas y sin errores', async () => {
  const m = crearMercado({ modo: 'fixtures' });
  const r = await correrPasada(m, { delayRecheckMs: 0 });
  assert.equal(r.errores.length, 0);
  assert.equal(r.red.redCaida, true);
  const e = r.estadisticas;
  assert.equal(e.brutas, r.oportunidades.length);
  assert.ok(e.combinacionesEvaluadas > e.brutas);
  assert.ok(r.oportunidades.every((o) => o.bruto > 0));
  assert.equal(e.netasPositivas, r.oportunidades.filter((o) => o.veredicto !== VEREDICTO.MUERE).length);
  assert.ok(e.tasaSupervivencia >= 0 && e.tasaSupervivencia <= 1);
  assert.ok(e.pisoCostoPromedio > e.brutoPromedio, 'el piso de costo promedio supera al spread bruto promedio');
  // ordenadas por neto desc
  for (let i = 1; i < r.oportunidades.length; i++) assert.ok(r.oportunidades[i].neto <= r.oportunidades[i - 1].neto);
  // en este snapshot solo sobreviven el cash & carry y el rulo oficial (en papel); ningún spot cruzado ni triangular
  const vivas = r.oportunidades.filter((o) => o.veredicto !== VEREDICTO.MUERE);
  assert.ok(vivas.length > 0 && vivas.every((o) => o.estrategia === 'funding' || o.detalle.variante === 'rulo-oficial'));
  assert.ok(!vivas.some((o) => o.estrategia === 'cex-cex' || o.estrategia === 'triangular'));
  assert.ok(r.curvas.length >= 1 && r.curvas[0].puntos.length > 5);
  assert.ok(!Object.keys(r).includes('ctx') && r.ctx.libros.binance);
});

test('tasa de fantasma: con costos en cero, el 0,15 % de Kraken sobrevive en t0 y desaparece al re-chequear (t1)', async () => {
  const m = crearMercado({ modo: 'fixtures' });
  const sinCostos = structuredClone(COSTOS);
  for (const f of Object.values(sinCostos.exchanges)) { f.spotTaker = 0; f.retiroUSDT = 0; f.retiroSeg = 0; }
  const r = await correrPasada(m, { delayRecheckMs: 0, estrategias: ['cex-cex'], pares: ['BTC/USDT'], nocionales: [1_000], costos: sinCostos });
  const kr = r.oportunidades.find((o) => o.ruta === 'binance → kraken');
  assert.equal(kr.veredicto, VEREDICTO.SOBREVIVE);
  assert.equal(kr.recheck.hecho, true);
  assert.equal(kr.recheck.fantasma, true, 'a los N ms el spread se cerró');
  assert.ok(r.estadisticas.recheckeadas > 0);
  assert.ok(r.estadisticas.tasaFantasma > 0);
  assert.ok(m.estadoRed().pedidos === 0, 'en modo fixtures no sale a la red');
});

test('registro JSONL: cada observación queda escrita y el reporte la lee', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-'));
  const reg = crearRegistro(join(dir, 'obs.jsonl'));
  const m = crearMercado({ modo: 'fixtures' });
  const r = await correrPasada(m, { delayRecheckMs: 0, registro: reg, estrategias: ['cex-cex', 'funding'] });
  const lineas = readFileSync(reg.ruta, 'utf8').trim().split('\n');
  assert.equal(lineas.length, r.oportunidades.length);
  const obs = JSON.parse(lineas[0]);
  assert.ok('bruto' in obs && 'neto' in obs && 'superviviente' in obs && 'costos' in obs && 'recheck' in obs);
  const e = reg.estadisticas();
  assert.equal(e.brutas, r.estadisticas.brutas);
  assert.equal(e.netasPositivas, r.estadisticas.netasPositivas);
  assert.equal(e.pasadas, 1);
});

test('acumulador de watch suma pasadas', async () => {
  const m = crearMercado({ modo: 'fixtures' });
  const acum = crearAcumulador();
  acum.sumar(await correrPasada(m, { delayRecheckMs: 0, pasada: 1, estrategias: ['triangular'] }));
  acum.sumar(await correrPasada(m, { delayRecheckMs: 0, pasada: 2, estrategias: ['triangular'] }));
  assert.equal(acum.estadisticas().pasadas, 2);
  assert.ok(acum.cantidad() > 0);
});

test('estrategia desconocida se reporta como error, no explota', async () => {
  const m = crearMercado({ modo: 'fixtures' });
  const r = await correrPasada(m, { delayRecheckMs: 0, estrategias: ['triangular', 'magia'] });
  assert.ok(r.errores.some((e) => /magia/.test(e.error)));
  assert.ok(Object.keys(ESTRATEGIAS).length === 4);
});
