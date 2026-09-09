import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearMercado } from '../src/exchanges.mjs';
import { armarContexto } from '../src/motor.mjs';
import { VEREDICTO } from '../src/costos.mjs';
import * as cexCex from '../src/estrategias/cex-cex.mjs';
import * as triangular from '../src/estrategias/triangular.mjs';
import * as funding from '../src/estrategias/funding.mjs';
import * as ars from '../src/estrategias/ars.mjs';

let ctx;
before(async () => {
  const m = crearMercado({ modo: 'fixtures' });
  ctx = await armarContexto(m, { exchanges: m.exchanges, pares: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ETH/BTC'], nocionales: [100, 1_000, 10_000] });
});

const coherente = (o) => {
  assert.ok(Number.isFinite(o.bruto) && Number.isFinite(o.neto), `${o.clave} tiene NaN`);
  assert.ok(Math.abs(o.bruto - o.costos.totalConImpuesto - o.neto) < 1e-9, `${o.clave}: bruto − costos ≠ neto`);
  assert.ok(o.costos.comisiones >= 0 && o.costos.slippage >= 0 && o.costos.retiro >= 0 && o.costos.riesgoTraslado >= 0);
  assert.ok(['sobrevive', 'marginal', 'muere'].includes(o.veredicto));
  assert.equal(typeof o.clave, 'string');
};

test('cex-cex: desglosa todo y el cruce tentador Binance → Kraken (0,15 %) muere', () => {
  const ops = cexCex.evaluar(ctx);
  assert.ok(ops.length > 50);
  ops.forEach(coherente);
  const kr = ops.filter((o) => o.par === 'BTC/USDT' && o.ruta === 'binance → kraken');
  assert.equal(kr.length, 3);
  assert.ok(kr.every((o) => o.costos.comisiones === 0.005), 'Binance 0,10 % + Kraken 0,40 %');
  for (const o of kr) {
    assert.ok(o.bruto > 0.0014, `bruto tentador ${o.bruto}`);
    assert.equal(o.veredicto, VEREDICTO.MUERE);
    assert.ok(o.costos.comisiones > 0.0035);
    assert.ok(o.costos.riesgoTraslado > 0);
  }
  // a 10.000 USD el slippage ya se nota (Kraken tiene 0,05 BTC en el top)
  const grande = kr.find((o) => o.nocional === 10_000);
  assert.ok(grande.costos.slippage > 0, 'slippage a 10k');
  // ningún cruce spot sobrevive con el modelo completo en este snapshot
  assert.equal(ops.filter((o) => o.veredicto !== VEREDICTO.MUERE).length, 0);
});

test('triangular: encuentra los triángulos, evalúa ambos ciclos y todos mueren por 3 taker', () => {
  const ops = triangular.evaluar(ctx);
  assert.ok(ops.length >= 6);
  ops.forEach(coherente);
  const venues = new Set(ops.map((o) => o.detalle.venue));
  assert.ok(venues.has('binance') && venues.has('okx') && venues.has('bybit'));
  assert.ok(ops.some((o) => o.detalle.ciclo === 'A') && ops.some((o) => o.detalle.ciclo === 'B'));
  for (const o of ops) {
    assert.equal(o.costos.comisiones, 0.003);
    assert.equal(o.costos.retiro, 0);
    assert.equal(o.veredicto, VEREDICTO.MUERE);
  }
  assert.deepEqual(triangular.triangulosDe({ 'BTC/USDT': 1, 'ETH/USDT': 1, 'ETH/BTC': 1 }), [{ b1: 'BTC', b2: 'ETH', cruzado: 'ETH/BTC' }]);
});

test('funding: calcula break-even (Binance BTC ≈ 10 días con 0,30 % round-trip) y anualizado', () => {
  const ops = funding.evaluar(ctx);
  assert.ok(ops.length >= 5);
  ops.forEach(coherente);
  const b = ops.find((o) => o.par === 'BTC/USDT' && o.ruta.startsWith('binance') && o.nocional === 1_000);
  assert.ok(b);
  assert.equal(b.detalle.tasa8h, 0.0001);
  assert.ok(Math.abs(b.detalle.fundingAnualizado - 0.1095) < 1e-6);
  assert.ok(b.detalle.breakEvenDias > 9 && b.detalle.breakEvenDias < 10.5, `${b.detalle.breakEvenDias}`);
  assert.equal(b.detalle.horizonteDias, 30);
  assert.match(b.detalle.advertencia, /no es fijo/);
  // a un horizonte más corto que el break-even, muere
  const corto = funding.evaluar({ ...ctx, opciones: { horizonteDias: 5 } }).find((o) => o.clave === b.clave);
  assert.equal(corto.veredicto, VEREDICTO.MUERE);
});

test('ars (cruce entre plataformas, foto real 08/09/2026): ningún bid supera ningún ask → todo muere', () => {
  const ops = ars.evaluar(ctx).filter((o) => o.detalle.variante === 'cruce');
  assert.ok(ops.length >= 12 * 3);
  ops.forEach(coherente);
  assert.ok(ops.every((o) => o.bruto < 0), 'no hay ni una oportunidad bruta entre plataformas');
  assert.equal(ops.filter((o) => o.veredicto !== VEREDICTO.MUERE).length, 0);
  const r = ars.resumenArs(ctx.ars);
  assert.ok(r.filas.every((f) => f.spreadEfectivo >= 0));
  assert.equal(r.mejorVenta.plataforma, 'fiwind');
});

test('ars (rulo oficial BNA → USDT): la foto del 08/09 da +2,6/+3,2 % de premium y sobrevive EN PAPEL, con SIN VERIFICAR explícitos', () => {
  const ops = ars.evaluar(ctx).filter((o) => o.detalle.variante === 'rulo-oficial');
  assert.ok(ops.length >= 4);
  ops.forEach(coherente);
  const r = ars.resumenArs(ctx.ars);
  assert.ok(r.premiumVsOficial > 0.025 && r.premiumVsOficial < 0.035, `premium medido ${r.premiumVsOficial}`);
  const fiwind = ops.find((o) => o.ruta.endsWith('fiwind') && o.nocional === 1_000);
  assert.ok(Math.abs(fiwind.bruto - (1579 / 1530 - 1)) < 1e-9);
  assert.ok(fiwind.costos.riesgoTraslado > 0, 'el premium puede moverse durante las 48 h del riel');
  assert.ok(fiwind.costos.impuesto > 0);
  assert.ok(fiwind.neto > 0.01, `neto ${fiwind.neto}`);
  assert.ok(Array.isArray(fiwind.detalle.advertencias) && fiwind.detalle.advertencias.some((a) => /SIN VERIFICAR/.test(a)));
  // con impuesto al cheque (cuenta corriente) y 0,5 % de fricción bancaria, el neto se achica a la mitad
  const peor = structuredClone(ctx.costos); peor.argentina.rulo.impuestoCheque = 0.012; peor.argentina.rulo.transferenciaUSDBanco = 0.005;
  const conCheque = ars.evaluar({ ...ctx, costos: peor }).find((o) => o.clave === fiwind.clave);
  assert.ok(conCheque.neto < fiwind.neto * 0.6, `neto con cheque ${conCheque.neto}`);
  // si el premium fuera el ≈ 0 % del brief, muere
  const sinPremium = structuredClone(ctx.ars); sinPremium.dolar.oficial.venta = 1580;
  const muerto = ars.evaluar({ ...ctx, ars: sinPremium }).find((o) => o.clave === fiwind.clave);
  assert.equal(muerto.veredicto, VEREDICTO.MUERE);
});
