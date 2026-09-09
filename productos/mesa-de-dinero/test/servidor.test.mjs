import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor } from '../src/servidor.mjs';
import { crearMercado } from '../src/exchanges.mjs';
import { ejecutar, OperacionNoAutorizada, MODO } from '../src/ejecucion.mjs';
import { crearRegistro } from '../src/registro.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('consola web: sirve HTML accesible con sello GSG, corre pasadas y nunca opera', async () => {
  const reg = crearRegistro(join(mkdtempSync(join(tmpdir(), 'mesa-srv-')), 'obs.jsonl'));
  const srv = await iniciarServidor({ puerto: 0, mercado: crearMercado({ modo: 'fixtures' }), registro: reg, opciones: { delayRecheckMs: 0 } });
  const base = `http://127.0.0.1:${srv.puerto}`;
  try {
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /Gestión Studio Grow/);
    assert.match(html, /role="alert"/);
    assert.match(html, /<label for="nocionales">/);
    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /no promete ganar plata/);

    const estado = await (await fetch(base + '/api/estado')).json();
    assert.equal(estado.modo, 'paper');
    assert.equal(estado.ultima, null);

    const scan = await (await fetch(base + '/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nocionales: [1000], estrategias: ['cex-cex', 'funding'] }) })).json();
    assert.ok(scan.oportunidades.length > 0);
    assert.ok(scan.estadisticas.brutas > 0);
    assert.equal(scan.modo, 'paper');
    assert.ok(scan.curvas.length > 0);

    const curva = await (await fetch(base + '/api/curva?par=BTC/USDT&compra=binance&venta=kraken')).json();
    assert.ok(curva.puntos.length > 5);

    const rep = await (await fetch(base + '/api/reporte')).json();
    assert.equal(rep.brutas, scan.oportunidades.length);

    const op = await fetch(base + '/api/operar', { method: 'POST' });
    assert.equal(op.status, 403);
    assert.match((await op.json()).error, /MODO PAPEL/);

    const r404 = await fetch(base + '/api/nada');
    assert.equal(r404.status, 404);
  } finally {
    await srv.cerrar();
  }
});

test('el stub de ejecución lanza siempre: operar requiere OK del dueño', () => {
  assert.equal(MODO, 'paper');
  assert.throws(() => ejecutar({ par: 'BTC/USDT', lado: 'compra', cantidad: 1 }), OperacionNoAutorizada);
  assert.throws(() => ejecutar(), /dueño/);
});
