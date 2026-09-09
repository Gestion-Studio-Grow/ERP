import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COSTOS, costoCexCex, costoTriangular, costoFundingRoundTrip, breakEvenDias, riesgoTraslado, impuestoSobre, liquidar, veredictoDe, VEREDICTO, fijoComoFraccion } from '../src/costos.mjs';

test('los números del modelo son los verificados 2026', () => {
  assert.equal(COSTOS.exchanges.binance.spotTaker, 0.0010);
  assert.equal(COSTOS.exchanges.binance.spotTakerBNB, 0.00075);
  assert.equal(COSTOS.exchanges.binance.futMaker, 0.0002);
  assert.ok(COSTOS.exchanges.binance.futTaker >= 0.0004 && COSTOS.exchanges.binance.futTaker <= 0.0005);
  assert.equal(COSTOS.exchanges.binance.retiroUSDT, 1);
  assert.equal(COSTOS.exchanges.kraken.spotTaker, 0.0040); // MODELO-DE-COSTOS.md §1 (tier base post 09/07/2026, conservador)
  assert.equal(COSTOS.exchanges.okx.retiroUSDT, 2.6);
  assert.equal(COSTOS.exchanges.okx.spotTaker, 0.0010);
  assert.equal(COSTOS.exchanges.bybit.spotTaker, 0.0010);
  assert.equal(COSTOS.argentina.spreadEfectivoMin, 0.035);
  assert.equal(COSTOS.argentina.spreadEfectivoMax, 0.08);
  assert.equal(COSTOS.argentina.premiumVsOficial, 0);
  assert.equal(COSTOS.impuestos.gananciaNetaPF, 0.15);
  assert.deepEqual(COSTOS.mercado.vidaSpreadMs, [200, 800]);
});

test('LA VERDAD INCÓMODA: un spread bruto de 0,15 % Binance → Kraken queda NEGATIVO tras costos', () => {
  const bruto = 0.0015;
  for (const nocional of [100, 1_000, 10_000, 100_000]) {
    const d = costoCexCex({ compraEn: 'binance', ventaEn: 'kraken', nocionalUSD: nocional, activo: 'BTC', slippage: 0 });
    const liq = liquidar(bruto, d);
    assert.ok(liq.neto < 0, `a ${nocional} USD el neto debería ser negativo y es ${liq.neto}`);
    assert.equal(liq.veredicto, VEREDICTO.MUERE);
    // solo las comisiones (0,10 + 0,26 = 0,36 %) ya superan el bruto, sin contar retiro ni riesgo
    assert.ok(d.comisiones > bruto);
  }
});

test('incluso entre los exchanges más baratos, 0,15 % bruto no paga el modelo completo a 1.000 USD', () => {
  const d = costoCexCex({ compraEn: 'binance', ventaEn: 'bybit', nocionalUSD: 1_000, activo: 'BTC', slippage: 0 });
  const liq = liquidar(0.0015, d);
  assert.ok(liq.neto < 0, `neto ${liq.neto}`);
});

test('el desglose suma: comisiones + retiro + slippage + riesgo = total', () => {
  const d = costoCexCex({ compraEn: 'binance', ventaEn: 'okx', nocionalUSD: 1_000, activo: 'ETH', slippage: 0.0003 });
  assert.ok(Math.abs(d.comisiones + d.retiro + d.slippage + d.riesgoTraslado - d.total) < 1e-12);
  assert.equal(d.comisiones, 0.002);
  assert.equal(d.retiro, 0.001); // USD 1 sobre 1.000
});

test('el retiro fijo pesa más cuanto más chico el nocional', () => {
  assert.equal(fijoComoFraccion(1, 100), 0.01);
  assert.equal(fijoComoFraccion(1, 10_000), 0.0001);
});

test('riesgo de traslado escala con sqrt del tiempo y con la volatilidad', () => {
  const r2 = riesgoTraslado('BTC', 120);
  const r8 = riesgoTraslado('BTC', 480);
  assert.ok(Math.abs(r8 / r2 - 2) < 1e-9);
  assert.ok(riesgoTraslado('ETH', 120) > r2);
  assert.ok(riesgoTraslado('USDT', 120) < 1e-5);
  assert.ok(r2 > 0.0005 && r2 < 0.002, `BTC 2 min ≈ 0,09 %: ${r2}`);
});

test('triangular: 3 taker fees, sin retiro ni traslado', () => {
  const d = costoTriangular({ venue: 'binance' });
  assert.equal(d.comisiones, 0.003);
  assert.equal(d.retiro, 0);
  assert.equal(d.riesgoTraslado, 0);
});

test('cash & carry: break-even con 0,28 % round-trip y funding neutro 0,01 %/8h ≈ 9,3 días', () => {
  const be = breakEvenDias(0.0028, 0.0001);
  assert.ok(Math.abs(be - 9.333) < 0.01, `${be}`);
  assert.equal(breakEvenDias(0.0028, 0), Infinity);
  const rt = costoFundingRoundTrip({ venue: 'binance', futTaker: 0.0004 });
  assert.ok(Math.abs(rt.total - 0.0028) < 1e-12);
  const rt5 = costoFundingRoundTrip({ venue: 'binance' });
  assert.ok(rt5.total >= 0.0028 && rt5.total <= 0.0030);
  assert.throws(() => costoFundingRoundTrip({ venue: 'kraken' }), /perpetuos/);
});

test('impuesto: 15 % solo sobre ganancia; con pérdida no hay impuesto', () => {
  assert.ok(Math.abs(impuestoSobre(0.01) - 0.0015) < 1e-12);
  assert.equal(impuestoSobre(-0.01), 0);
});

test('veredicto: umbral marginal', () => {
  assert.equal(veredictoDe(0.001), VEREDICTO.SOBREVIVE);
  assert.equal(veredictoDe(0.0002), VEREDICTO.MARGINAL);
  assert.equal(veredictoDe(0), VEREDICTO.MARGINAL);
  assert.equal(veredictoDe(-0.0001), VEREDICTO.MUERE);
});

test('liquidar: bruto − costos − impuesto = neto', () => {
  const liq = liquidar(0.01, costoTriangular({ venue: 'okx' }));
  assert.ok(Math.abs(liq.bruto - liq.costos.totalConImpuesto - liq.neto) < 1e-12);
  assert.ok(liq.costos.impuesto > 0);
});
