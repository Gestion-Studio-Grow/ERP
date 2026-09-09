import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearMercado, CONECTORES, normalizarDolar, ErrorDeRed } from '../src/exchanges.mjs';

const crudo = (n) => JSON.parse(readFileSync(new URL(`./fixtures/crudos/${n}.json`, import.meta.url), 'utf8'));

test('normalizadores: cada API cruda termina en {bids, asks} numéricos', () => {
  const casos = { binance: 'binance-depth', kraken: 'kraken-depth', bybit: 'bybit-orderbook', okx: 'okx-books', coinbase: 'coinbase-book' };
  for (const [ex, f] of Object.entries(casos)) {
    const l = CONECTORES[ex].normalizarLibro(crudo(f));
    assert.equal(l.bids.length, 2, ex);
    assert.equal(typeof l.bids[0][0], 'number', ex);
    assert.equal(typeof l.asks[0][1], 'number', ex);
    assert.ok(l.asks[0][0] > l.bids[0][0], `${ex}: ask > bid`);
  }
});

test('símbolos por exchange', () => {
  assert.equal(CONECTORES.binance.simbolo('BTC/USDT'), 'BTCUSDT');
  assert.equal(CONECTORES.kraken.simbolo('BTC/USDT'), 'XBTUSDT');
  assert.equal(CONECTORES.okx.simbolo('BTC/USDT'), 'BTC-USDT');
  assert.equal(CONECTORES.coinbase.simbolo('ETH/USDT'), 'ETH-USDT');
  assert.match(CONECTORES.binance.urlLibro('BTCUSDT', 100), /^https:\/\/api\.binance\.com\/api\/v3\/depth\?symbol=BTCUSDT/);
});

test('sin red: cae a fixture, avisa UNA sola vez y marca origen=fixture', async () => {
  const avisos = [];
  let llamadas = 0;
  const fetchRoto = async () => { llamadas++; throw new TypeError('fetch failed'); };
  const m = crearMercado({ modo: 'auto', fetchImpl: fetchRoto, reintentos: 0, alAvisar: (x) => avisos.push(x) });
  const l1 = await m.libroDeOrdenes('binance', 'BTC/USDT');
  const l2 = await m.libroDeOrdenes('kraken', 'BTC/USDT');
  assert.equal(l1.origen, 'fixture');
  assert.equal(l2.origen, 'fixture');
  assert.equal(l1.fuente, 'binance');
  assert.ok(l1.asks[0][0] > l1.bids[0][0]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /sin salida de red/);
  assert.equal(llamadas, 1, 'tras la primera caída no insiste con la red');
  assert.equal(m.estadoRed().redCaida, true);
});

test('con red: usa la respuesta real y marca origen=red', async () => {
  const fetchOk = async () => ({ ok: true, json: async () => crudo('binance-depth') });
  const m = crearMercado({ modo: 'auto', fetchImpl: fetchOk });
  const l = await m.libroDeOrdenes('binance', 'BTC/USDT');
  assert.equal(l.origen, 'red');
  assert.equal(m.estadoRed().redCaida, false);
});

test('modo red sin fallback: lanza ErrorDeRed; HTTP != 2xx también', async () => {
  const m = crearMercado({ modo: 'red', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }), reintentos: 0 });
  await assert.rejects(() => m.libroDeOrdenes('binance', 'BTC/USDT'), ErrorDeRed);
});

test('modo fixtures nunca llama a fetch y sirve el instante t1 para re-chequear', async () => {
  let llamadas = 0;
  const m = crearMercado({ modo: 'fixtures', fetchImpl: async () => { llamadas++; } });
  const t0 = await m.libroDeOrdenes('kraken', 'BTC/USDT');
  const t1 = await m.libroDeOrdenes('kraken', 'BTC/USDT', 100, { instante: 't1' });
  assert.ok(t0.bids[0][0] > t1.bids[0][0], 'en t1 el bid de Kraken bajó');
  const f = await m.funding('binance', 'BTC/USDT');
  assert.equal(f.tasa8h, 0.0001);
  assert.equal(await m.funding('kraken', 'BTC/USDT'), null);
  const a = await m.ars();
  assert.ok(a.usdt.binancep2p.ask > 0);
  const t = await m.tickers('okx', ['BTC/USDT']);
  assert.ok(t['BTC/USDT'].ask > t['BTC/USDT'].bid);
  assert.equal(await m.libroDeOrdenes('coinbase', 'SOL/USDT'), null, 'par sin fixture → null, no explota');
  assert.equal(llamadas, 0);
});

test('normalizarDolar aplana el formato de criptoya', () => {
  const d = normalizarDolar({ oficial: { compra: 1440, venta: 1460 }, mep: { al30: { ci: { price: 1455 } } }, ccl: { al30: { ci: { price: 1470 } } }, blue: { compra: 1455, venta: 1475 } });
  assert.equal(d.oficial.venta, 1460);
  assert.equal(d.mep, 1455);
  assert.equal(d.blue.venta, 1475);
});
