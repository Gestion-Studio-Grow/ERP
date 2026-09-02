#!/usr/bin/env node
/**
 * Backtester reproducible de BTC en velas de 15 minutos — Mesa Cripto (Agencia Grow, GSG).
 *
 * Qué hace: baja OHLCV público (Binance o Bybit) o lee un CSV, y corre estrategias clásicas
 * (EMA cross, RSI, Bollinger, Donchian) contra buy&hold y contra una estrategia ALEATORIA con
 * los mismos costos (Monte Carlo), con comisión + slippage reales del exchange elegido.
 * Señal en cierre de vela → ejecución en la apertura de la siguiente (sin look-ahead).
 * Split in-sample 70% / out-of-sample 30% (ADR: método del agente quant-trading).
 *
 * Uso (desktop, con internet):
 *   node scripts/btc-15m-backtest.mjs --source binance --days 365 --exchange binance
 *   node scripts/btc-15m-backtest.mjs --source bybit   --days 180 --exchange lemon
 *   node scripts/btc-15m-backtest.mjs --csv datos.csv  --exchange binance   (columnas: time,open,high,low,close[,volume])
 *   node scripts/btc-15m-backtest.mjs --synthetic 365  --exchange binance   (humo: GBM sin edge, σ calibrada)
 *
 * Opciones: --fee 0.001 (por lado) --slippage 0.0002 (por lado) --short (permite cortos, solo futuros)
 *           --mc 200 (corridas Monte Carlo) --seed 42 --json salida.json
 * Cero dependencias. No pide claves API: solo endpoints públicos. Nunca opera.
 */

const args = parseArgs(process.argv.slice(2));

// ── Presets de costo por lado (comisión). El slippage se suma aparte. ──────────────────────────
const EXCHANGES = {
  binance: { fee: 0.001, slippage: 0.0002, label: 'Binance spot taker 0,10% + slip 0,02%' },
  binanceBnb: { fee: 0.00075, slippage: 0.0002, label: 'Binance spot taker c/BNB 0,075% + slip 0,02%' },
  binanceFut: { fee: 0.0005, slippage: 0.0002, label: 'Binance futuros taker 0,05% + slip 0,02% (sin funding)' },
  p2p: { fee: 0.01, slippage: 0.0005, label: 'Binance P2P spread implícito ~1% por lado' },
  lemon: { fee: 0.015, slippage: 0, label: 'Lemon app spread ~1,5% por lado (1–2% según fuente)' },
  lemonBajo: { fee: 0.01, slippage: 0, label: 'Lemon app spread bajo 1% por lado' },
};

async function main() {
  const preset = EXCHANGES[args.exchange ?? 'binance'] ?? EXCHANGES.binance;
  const fee = args.fee != null ? Number(args.fee) : preset.fee;
  const slippage = args.slippage != null ? Number(args.slippage) : preset.slippage;
  const costSide = fee + slippage; // costo por lado
  const allowShort = Boolean(args.short);
  const mcRuns = Number(args.mc ?? 200);
  const seed = Number(args.seed ?? 42);

  let candles;
  let sourceLabel;
  if (args.csv) {
    candles = readCsv(args.csv);
    sourceLabel = `CSV ${args.csv}`;
  } else if (args.synthetic) {
    const days = Number(args.synthetic) || 365;
    candles = synthetic(days * 96, seed, Number(args.sigma ?? 0.0020));
    sourceLabel = `SINTÉTICO GBM sin edge · ${days} días · σ/vela ${(Number(args.sigma ?? 0.002) * 100).toFixed(2)}%`;
  } else {
    const days = Number(args.days ?? 365);
    const source = args.source ?? 'binance';
    candles = source === 'bybit' ? await fetchBybit(days) : await fetchBinance(days);
    sourceLabel = `${source} BTCUSDT 15m · ${days} días · ${new Date(candles[0].t).toISOString().slice(0, 10)} → ${new Date(candles.at(-1).t).toISOString().slice(0, 10)}`;
  }
  if (candles.length < 500) throw new Error(`Muy pocas velas (${candles.length}); necesito ≥ 500.`);

  // ── Estadística base de la serie ───────────────────────────────────────────────────────────
  const rets = [];
  for (let i = 1; i < candles.length; i++) rets.push(Math.log(candles[i].c / candles[i - 1].c));
  const sigma = std(rets);
  const meanAbs = rets.reduce((a, r) => a + Math.abs(r), 0) / rets.length;
  const sigmaAnnual = sigma * Math.sqrt(365 * 96);
  const roundTrip = 2 * costSide;

  const split = Math.floor(candles.length * 0.7);
  const strategies = buildStrategies(allowShort);

  const rows = [];
  for (const s of strategies) {
    const pos = s.positions(candles);
    const all = simulate(candles, pos, costSide);
    const ins = simulate(candles.slice(0, split), pos.slice(0, split), costSide);
    const oos = simulate(candles.slice(split), pos.slice(split), costSide);
    rows.push({ name: s.name, params: s.params, all, ins, oos });
  }

  // Buy & hold (1 compra + 1 venta)
  const bh = simulate(candles, candles.map(() => 1), costSide);
  const bhOos = simulate(candles.slice(split), candles.slice(split).map(() => 1), costSide);

  // Monte Carlo: posiciones aleatorias con la misma frecuencia de trade que la EMA 9/21
  const refTrades = rows[0].all.trades;
  const rng = mulberry32(seed);
  const mc = [];
  for (let k = 0; k < mcRuns; k++) {
    const pos = randomPositions(candles.length, refTrades, rng, allowShort);
    mc.push(simulate(candles, pos, costSide).netReturn);
  }
  mc.sort((a, b) => a - b);
  const mcStats = { mean: mean(mc), p5: pct(mc, 0.05), p50: pct(mc, 0.5), p95: pct(mc, 0.95), positive: mc.filter((x) => x > 0).length / mc.length };

  // Break-even analítico: cuántas velas hay que "acertar" para pagar el costo ida+vuelta
  const breakEvenSigmas = roundTrip / sigma;

  // ── Salida ─────────────────────────────────────────────────────────────────────────────────
  const out = [];
  out.push(`# Backtest BTC 15m — ${sourceLabel}`);
  out.push(`Costos: ${preset.label}${args.fee != null || args.slippage != null ? ' (override)' : ''} → por lado ${(costSide * 100).toFixed(3)}% · ida+vuelta ${(roundTrip * 100).toFixed(3)}%`);
  out.push(`Velas: ${candles.length} · σ por vela ${(sigma * 100).toFixed(3)}% · |ret| medio ${(meanAbs * 100).toFixed(3)}% · σ anualizada ${(sigmaAnnual * 100).toFixed(1)}%`);
  out.push(`**Break-even:** el costo ida+vuelta equivale a **${breakEvenSigmas.toFixed(2)} σ de una vela**. Cada trade tiene que capturar eso solo para empatar.`);
  out.push('');
  out.push('| Estrategia | Trades | Neto total | Neto IS (70%) | Neto OOS (30%) | B&H OOS | MaxDD | Win% | PF | Exp/trade | Costos pagados |');
  out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    out.push(`| ${r.name} ${r.params} | ${r.all.trades} | ${p(r.all.netReturn)} | ${p(r.ins.netReturn)} | ${p(r.oos.netReturn)} | ${p(bhOos.netReturn)} | ${p(-r.all.maxDD)} | ${(r.all.winRate * 100).toFixed(0)}% | ${r.all.profitFactor.toFixed(2)} | ${p(r.all.expectancy)} | ${p(r.all.costPaid)} |`);
  }
  out.push(`| Buy & hold | ${bh.trades} | ${p(bh.netReturn)} | — | ${p(bhOos.netReturn)} | ${p(bhOos.netReturn)} | ${p(-bh.maxDD)} | — | — | — | ${p(bh.costPaid)} |`);
  out.push('');
  out.push(`**Monte Carlo (${mcRuns} corridas aleatorias, ${refTrades} trades c/u, mismos costos):** media ${p(mcStats.mean)} · p5 ${p(mcStats.p5)} · mediana ${p(mcStats.p50)} · p95 ${p(mcStats.p95)} · % corridas positivas ${(mcStats.positive * 100).toFixed(0)}%`);
  out.push('Lectura: una estrategia tiene edge solo si su neto OOS supera el p95 aleatorio Y le gana a buy&hold OOS. Si cae dentro de la banda aleatoria, es ruido más costos.');
  out.push('');
  out.push('Notas: señal en cierre → ejecución en apertura siguiente; long-only salvo `--short`; sin funding ni intereses; sin impuestos (Ganancias AR 5%/15% sobre resultado). Script sin dependencias, endpoints públicos, nunca opera. — GSG · quant-trading');
  const text = out.join('\n');
  console.log(text);
  if (args.json) {
    const fs = await import('node:fs');
    fs.writeFileSync(args.json, JSON.stringify({ sourceLabel, costSide, roundTrip, sigma, sigmaAnnual, breakEvenSigmas, rows, bh, bhOos, mcStats }, null, 2));
  }
}

// ── Estrategias ────────────────────────────────────────────────────────────────────────────────
function buildStrategies(allowShort) {
  const dir = (long, short) => (long ? 1 : short && allowShort ? -1 : 0);
  return [
    { name: 'EMA cross', params: '9/21', positions: (c) => { const f = ema(c.map((x) => x.c), 9), s = ema(c.map((x) => x.c), 21); return c.map((_, i) => (i < 21 ? 0 : dir(f[i] > s[i], f[i] < s[i]))); } },
    { name: 'EMA cross', params: '21/55', positions: (c) => { const f = ema(c.map((x) => x.c), 21), s = ema(c.map((x) => x.c), 55); return c.map((_, i) => (i < 55 ? 0 : dir(f[i] > s[i], f[i] < s[i]))); } },
    { name: 'EMA cross', params: '50/200', positions: (c) => { const f = ema(c.map((x) => x.c), 50), s = ema(c.map((x) => x.c), 200); return c.map((_, i) => (i < 200 ? 0 : dir(f[i] > s[i], f[i] < s[i]))); } },
    { name: 'RSI reversión', params: '14 <30/>70', positions: (c) => { const r = rsi(c.map((x) => x.c), 14); let pos = 0; return c.map((_, i) => { if (i < 15) return 0; if (r[i] < 30) pos = 1; else if (r[i] > 70) pos = allowShort ? -1 : 0; else if (pos === -1 && r[i] < 50) pos = 0; else if (pos === 1 && r[i] > 50) pos = 0; return pos; }); } },
    { name: 'Bollinger reversión', params: '20/2σ', positions: (c) => { const cl = c.map((x) => x.c); const m = sma(cl, 20), sd = rollingStd(cl, 20); let pos = 0; return c.map((_, i) => { if (i < 20) return 0; if (cl[i] < m[i] - 2 * sd[i]) pos = 1; else if (cl[i] > m[i] + 2 * sd[i]) pos = allowShort ? -1 : 0; else if ((pos === 1 && cl[i] >= m[i]) || (pos === -1 && cl[i] <= m[i])) pos = 0; return pos; }); } },
    { name: 'Donchian breakout', params: '20', positions: (c) => { let pos = 0; return c.map((_, i) => { if (i < 20) return 0; const w = c.slice(i - 20, i); const hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l)); if (c[i].c > hi) pos = 1; else if (c[i].c < lo) pos = allowShort ? -1 : 0; return pos; }); } },
    { name: 'Donchian breakout', params: '96 (1 día)', positions: (c) => { let pos = 0; return c.map((_, i) => { if (i < 96) return 0; const w = c.slice(i - 96, i); const hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l)); if (c[i].c > hi) pos = 1; else if (c[i].c < lo) pos = allowShort ? -1 : 0; return pos; }); } },
  ];
}

// ── Motor: posición deseada al cierre de i se ejecuta en la apertura de i+1 ────────────────────
function simulate(candles, desired, costSide) {
  let equity = 1, peak = 1, maxDD = 0, pos = 0, entryEq = 0, costPaid = 0, trades = 0;
  let wins = 0, grossWin = 0, grossLoss = 0;
  const tradePnls = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const target = desired[i] ?? 0;
    const openNext = candles[i + 1].o;
    if (target !== pos) {
      // cerrar posición actual en la apertura siguiente
      if (pos !== 0) {
        const c = equity * costSide; costPaid += c; equity -= c;
        const pnl = equity - entryEq; tradePnls.push(pnl / entryEq); trades++;
        if (pnl > 0) { wins++; grossWin += pnl; } else grossLoss += -pnl;
      }
      if (target !== 0) { const c = equity * costSide; costPaid += c; equity -= c; entryEq = equity; }
      pos = target;
    }
    // marcar a mercado de apertura i+1 a cierre i+1
    const r = candles[i + 1].c / openNext - 1;
    if (pos === 1) equity *= 1 + r; else if (pos === -1) equity *= 1 - r;
    // equity entre trades ya incluye el tramo abierto→cierre; el próximo tramo se mide open→close, así que
    // el gap cierre→apertura se atribuye también a la posición abierta:
    if (i + 2 < candles.length) { const gap = candles[i + 2].o / candles[i + 1].c - 1; if (pos === 1) equity *= 1 + gap; else if (pos === -1) equity *= 1 - gap; }
    if (equity > peak) peak = equity; const dd = 1 - equity / peak; if (dd > maxDD) maxDD = dd;
  }
  if (pos !== 0) { const c = equity * costSide; costPaid += c; equity -= c; const pnl = equity - entryEq; tradePnls.push(pnl / entryEq); trades++; if (pnl > 0) { wins++; grossWin += pnl; } else grossLoss += -pnl; }
  return {
    netReturn: equity - 1, maxDD, trades, winRate: trades ? wins / trades : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: trades ? mean(tradePnls) : 0, costPaid,
  };
}

function randomPositions(n, trades, rng, allowShort) {
  // Alterna entre plano y posición con la misma cantidad de trades: duración media n/(2*trades)
  const pos = new Array(n).fill(0); const avgLen = Math.max(1, Math.floor(n / Math.max(1, trades * 2)));
  let i = 0, inPos = false;
  while (i < n) { const len = Math.max(1, Math.floor(rng() * avgLen * 2)); const v = inPos ? (allowShort && rng() < 0.5 ? -1 : 1) : 0; for (let k = 0; k < len && i < n; k++, i++) pos[i] = v; inPos = !inPos; }
  return pos;
}

// ── Indicadores ────────────────────────────────────────────────────────────────────────────────
function ema(x, n) { const k = 2 / (n + 1); const out = []; let e = x[0]; for (let i = 0; i < x.length; i++) { e = i === 0 ? x[0] : x[i] * k + e * (1 - k); out.push(e); } return out; }
function sma(x, n) { const out = new Array(x.length).fill(NaN); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; if (i >= n - 1) out[i] = s / n; } return out; }
function rollingStd(x, n) { const out = new Array(x.length).fill(NaN); for (let i = n - 1; i < x.length; i++) out[i] = std(x.slice(i - n + 1, i + 1)); return out; }
function rsi(x, n) { const out = new Array(x.length).fill(50); let g = 0, l = 0; for (let i = 1; i < x.length; i++) { const d = x[i] - x[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return out; }
function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
function std(a) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); }
function pct(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]; }
function p(x) { return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`; }

// ── Datos ──────────────────────────────────────────────────────────────────────────────────────
async function fetchBinance(days) {
  const end = Date.now(); let start = end - days * 86400_000; const out = [];
  while (start < end) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&startTime=${start}&limit=1000`;
    const res = await fetch(url); if (!res.ok) throw new Error(`Binance ${res.status}`);
    const rows = await res.json(); if (!rows.length) break;
    for (const r of rows) out.push({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
    start = rows.at(-1)[0] + 900_000; await sleep(120);
  }
  return dedupe(out);
}
async function fetchBybit(days) {
  const end = Date.now(); let start = end - days * 86400_000; const out = [];
  while (start < end) {
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&start=${start}&limit=1000`;
    const res = await fetch(url); if (!res.ok) throw new Error(`Bybit ${res.status}`);
    const j = await res.json(); const rows = (j.result?.list ?? []).map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).sort((a, b) => a.t - b.t);
    if (!rows.length) break; out.push(...rows); start = rows.at(-1).t + 900_000; await sleep(120);
  }
  return dedupe(out);
}
function dedupe(rows) { const m = new Map(); for (const r of rows) m.set(r.t, r); return [...m.values()].sort((a, b) => a.t - b.t); }
function readCsv(path) {
  const fs = require_('node:fs'); const lines = fs.readFileSync(path, 'utf8').trim().split(/\r?\n/); const head = lines[0].toLowerCase().split(',');
  const ix = (k) => head.findIndex((h) => h.includes(k));
  const [ti, oi, hi, li, ci] = ['time', 'open', 'high', 'low', 'close'].map(ix);
  return dedupe(lines.slice(1).map((ln) => { const f = ln.split(','); const t = isNaN(+f[ti]) ? Date.parse(f[ti]) : +f[ti] * (String(f[ti]).length <= 10 ? 1000 : 1); return { t, o: +f[oi], h: +f[hi], l: +f[li], c: +f[ci] }; }));
}
function require_(m) { return globalThis.process.getBuiltinModule ? process.getBuiltinModule(m) : null; }
function synthetic(n, seed, sigma) {
  const rng = mulberry32(seed); let price = 60000; const out = []; let t = Date.now() - n * 900_000;
  for (let i = 0; i < n; i++) {
    const o = price; const r = gauss(rng) * sigma; const c = o * Math.exp(r);
    const h = Math.max(o, c) * (1 + Math.abs(gauss(rng)) * sigma * 0.5), l = Math.min(o, c) * (1 - Math.abs(gauss(rng)) * sigma * 0.5);
    out.push({ t, o, h, l, c, v: 0 }); price = c; t += 900_000;
  }
  return out;
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function parseArgs(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const nx = argv[i + 1]; if (nx && !nx.startsWith('--')) { o[k] = nx; i++; } else o[k] = true; } } return o; }

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
