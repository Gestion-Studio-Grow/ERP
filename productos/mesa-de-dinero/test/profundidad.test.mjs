import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barrer, spreadEjecutable, curvaSpread, normalizarLibro, comprarPorNocional, venderCantidad } from '../src/profundidad.mjs';

const fx = (n) => normalizarLibro(JSON.parse(readFileSync(new URL(`./fixtures/libros/${n}.json`, import.meta.url), 'utf8')));

test('nocional chico: el VWAP es el top-of-book y el slippage es 0', () => {
  const r = barrer([[100, 1], [101, 1]], { quote: 50 });
  assert.equal(r.precioPromedio, 100);
  assert.equal(r.slippage, 0);
  assert.equal(r.base, 0.5);
  assert.equal(r.completo, true);
  assert.equal(r.nivelesUsados, 1);
});

test('barrer varios niveles: el VWAP es el promedio ponderado real', () => {
  // 1 unidad a 100 + 1 unidad a 102 = 202 de quote por 2 de base → 101
  const r = barrer([[100, 1], [102, 1], [110, 5]], { quote: 202 });
  assert.ok(Math.abs(r.precioPromedio - 101) < 1e-9);
  assert.ok(Math.abs(r.slippage - 0.01) < 1e-9);
  assert.equal(r.nivelesUsados, 2);
});

test('barrer por base contra bids: vende lo pedido y calcula el quote', () => {
  const r = barrer([[100, 1], [99, 1]], { base: 1.5 });
  assert.equal(r.base, 1.5);
  assert.equal(r.quote, 100 + 49.5);
  assert.ok(r.precioPromedio < 100);
});

test('libro que no alcanza: completo=false y se ejecuta solo lo que hay', () => {
  const r = barrer([[100, 1]], { quote: 1000 });
  assert.equal(r.completo, false);
  assert.equal(r.quote, 100);
  assert.equal(r.base, 1);
});

test('barrer exige cantidad positiva', () => {
  assert.throws(() => barrer([[100, 1]], { quote: 0 }));
});

test('normalizarLibro ordena bids desc y asks asc, y castea strings', () => {
  const l = normalizarLibro({ bids: [['99', '1'], ['100', '2']], asks: [['102', '1'], ['101', '1']] });
  assert.deepEqual(l.bids[0], [100, 2]);
  assert.deepEqual(l.asks[0], [101, 1]);
});

test('spread ejecutable se derrumba al subir el nocional (Binance → Kraken BTC/USDT, fixture)', () => {
  const binance = fx('binance-BTCUSDT'), kraken = fx('kraken-BTCUSDT');
  const chico = spreadEjecutable(binance, kraken, 100);
  const grande = spreadEjecutable(binance, kraken, 100_000);
  // top-of-book: ~0,15 % de spread bruto "tentador"
  assert.ok(chico.top.spread > 0.0014 && chico.top.spread < 0.0016, `top ${chico.top.spread}`);
  // a 100 USD el ejecutable ≈ top
  assert.ok(Math.abs(chico.ejecutable.spread - chico.top.spread) < 1e-6);
  // a 100k el ejecutable es claramente menor: el libro de Kraken es finito
  assert.ok(grande.ejecutable.spread < chico.ejecutable.spread - 0.0003, `grande ${grande.ejecutable.spread}`);
  assert.ok(grande.derrumbe > 0);
});

test('curvaSpread: el slippage es monótono no decreciente con el nocional', () => {
  const c = curvaSpread(fx('binance-BTCUSDT'), fx('kraken-BTCUSDT'));
  for (let i = 1; i < c.length; i++) assert.ok(c[i].slippage >= c[i - 1].slippage - 1e-12, `punto ${i}`);
  for (let i = 1; i < c.length; i++) assert.ok(c[i].spreadEjecutable <= c[i - 1].spreadEjecutable + 1e-12);
});

test('helpers comprar/vender usan el lado correcto del libro', () => {
  const l = normalizarLibro({ bids: [[99, 1]], asks: [[101, 1]] });
  assert.equal(comprarPorNocional(l, 101).precioPromedio, 101);
  assert.equal(venderCantidad(l, 1).precioPromedio, 99);
});
