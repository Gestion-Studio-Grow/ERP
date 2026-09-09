import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearRegistro, estadisticasDe } from '../src/registro.mjs';

test('append-only, lectura tolerante a líneas corruptas, estadística por estrategia', () => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'mesa-reg-')), 'obs.jsonl');
  const reg = crearRegistro(ruta);
  assert.deepEqual(reg.leer(), []);
  reg.anotar({ ts: 1, pasada: 1, estrategia: 'cex-cex', bruto: 0.001, costos: { total: 0.003 }, neto: -0.002, superviviente: false, recheck: null });
  reg.anotar({ ts: 2, pasada: 1, estrategia: 'funding', bruto: 0.01, costos: { total: 0.003 }, neto: 0.007, superviviente: true, recheck: { hecho: true, fantasma: false } });
  reg.anotar({ ts: 3, pasada: 2, estrategia: 'funding', bruto: 0.01, costos: { total: 0.003 }, neto: 0.007, superviviente: true, recheck: { hecho: true, fantasma: true } });
  writeFileSync(ruta, '{esto no es json\n', { flag: 'a' });
  const obs = reg.leer();
  assert.equal(obs.length, 3);
  const e = estadisticasDe(obs);
  assert.equal(e.brutas, 3);
  assert.equal(e.netasPositivas, 2);
  assert.ok(Math.abs(e.tasaSupervivencia - 2 / 3) < 1e-12);
  assert.equal(e.recheckeadas, 2);
  assert.equal(e.fantasmas, 1);
  assert.equal(e.tasaFantasma, 0.5);
  assert.equal(e.pasadas, 2);
  assert.equal(e.porEstrategia.funding.tasaSupervivencia, 1);
  assert.equal(e.porEstrategia['cex-cex'].tasaSupervivencia, 0);
  assert.ok(Number.isNaN(e.porEstrategia['cex-cex'].tasaFantasma));
});
